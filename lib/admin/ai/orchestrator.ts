import { Buffer } from 'node:buffer'
import type {
  AiAsset,
  AiCreativeBrief,
  AiCreativeBriefPayload,
  AiGenerationJob,
  AiJobType,
  AiLanguage,
  AiProjectAnalysis,
  AssetRegenerateRequest,
  PosterGenerationRequest,
  RepoAnalysisRequest,
  VideoGenerationRequest,
} from '@/lib/admin/types'
import { getDatabaseAdapter } from '@/lib/admin/database'
import { buildRepoContextBundle } from './repo-context'
import {
  generateStructuredJson,
  pollPosterGeneration,
  pollVideoGeneration,
  submitPosterGeneration,
  submitVideoGeneration,
} from './providers'
import { hydrateAiAssetUrls, persistAiBinaryAsset, persistAiTextAsset, persistRemoteAiAsset } from './storage'
import { resolveAiLanguage, resolveAiProviderRoute, resolveAiRegion } from './provider-router'

interface JobEnvelope {
  job: AiGenerationJob
  assets: AiAsset[]
  analysis: AiProjectAnalysis | null
  brief: AiCreativeBrief | null
}

function isChineseLanguage(language: AiLanguage): boolean {
  return language === 'zh-CN'
}

function mergePayload(base: Record<string, any> | undefined, patch: Record<string, any>): Record<string, any> {
  return {
    ...(base || {}),
    ...patch,
  }
}

function toStringValue(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === "string") {
    return value.trim()
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function splitStringList(value: string): string[] {
  if (!value) {
    return []
  }
  if (/[\n;、,，]/.test(value)) {
    return value.split(/[\n;、,，]+/).map((item) => item.trim()).filter(Boolean)
  }
  return [value.trim()].filter(Boolean)
}

function extractObjectLabel(value: Record<string, any>): string | undefined {
  const keys = ["title", "name", "label", "angle", "feature", "summary", "text"]
  for (const key of keys) {
    const candidate = value[key]
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== "") {
      return String(candidate).trim()
    }
  }
  return undefined
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = []
    for (const item of value) {
      if (item === null || item === undefined) continue
      if (typeof item === "string") {
        out.push(...splitStringList(item))
        continue
      }
      if (Array.isArray(item)) {
        out.push(...toStringArray(item))
        continue
      }
      if (typeof item === "object") {
        const label = extractObjectLabel(item as Record<string, any>)
        out.push(label || toStringValue(item))
        continue
      }
      out.push(String(item))
    }
    return out.filter((item) => item.trim() !== "")
  }
  if (value === null || value === undefined) {
    return []
  }
  if (typeof value === "string") {
    return splitStringList(value)
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => {
        const label = typeof val === "object" && val !== null ? extractObjectLabel(val as Record<string, any>) : undefined
        const detail = label || toStringValue(val)
        return detail ? `${key}: ${detail}` : key
      })
      .filter((item) => item.trim() !== "")
  }
  return [String(value)]
}

function normalizeModuleTopology(value: unknown): Array<{ name: string; purpose: string; paths: string[] }> | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const normalized = value.map((item) => {
    const record = (item || {}) as Record<string, any>
    const name = toStringValue(record.name || record.title || record.module || '')
    const purpose = toStringValue(record.purpose || record.description || record.summary || '')
    const paths = toStringArray(record.paths || record.path || record.files || [])
    return { name, purpose, paths }
  }).filter((item) => item.name || item.purpose || item.paths.length > 0)
  return normalized.length > 0 ? normalized : undefined
}

function normalizeAnalysisPayload(input: any): AiProjectAnalysis["analysis_payload"] {
  return {
    product_name: toStringValue(input?.product_name, "Unknown product"),
    product_summary: toStringValue(input?.product_summary, ""),
    core_features: toStringArray(input?.core_features),
    target_users: toStringArray(input?.target_users),
    technical_stack: toStringArray(input?.technical_stack),
    deployment_topology: toStringArray(input?.deployment_topology),
    region_differences: toStringArray(input?.region_differences),
    marketing_angles: toStringArray(input?.marketing_angles),
    module_topology: normalizeModuleTopology(input?.module_topology),
  }
}
function normalizeBriefPayload(language: AiLanguage, input?: Partial<AiCreativeBriefPayload>): AiCreativeBriefPayload {
  return {
    audience: input?.audience || (isChineseLanguage(language) ? '企业客户、团队管理员、业务负责人' : 'team admins, enterprise buyers, and product leads'),
    core_selling_points: input?.core_selling_points || [],
    brand_tone: input?.brand_tone || (isChineseLanguage(language) ? '专业、可信、未来感' : 'confident, modern, trustworthy'),
    must_include: input?.must_include || [],
    must_avoid: input?.must_avoid || [],
    cta: input?.cta || (isChineseLanguage(language) ? '立即体验' : 'Try it now'),
    poster_goal: input?.poster_goal,
    style_preset: input?.style_preset,
    extra_notes: input?.extra_notes,
  }
}

function buildAnalysisSummaryText(payload: AiProjectAnalysis['analysis_payload'], language: AiLanguage): string {
  const lines = [
    `Product: ${payload.product_name}`,
    `Summary: ${payload.product_summary}`,
    `Core features: ${payload.core_features.join('; ')}`,
    `Target users: ${payload.target_users.join('; ')}`,
    `Tech stack: ${payload.technical_stack.join('; ')}`,
    `Deployment: ${payload.deployment_topology.join('; ')}`,
    `Region differences: ${payload.region_differences.join('; ')}`,
    `Marketing angles: ${payload.marketing_angles.join('; ')}`,
  ]

  if (language === 'zh-CN') {
    return lines.join('\n').replace('Product:', '产品：').replace('Summary:', '概述：').replace('Core features:', '核心功能：').replace('Target users:', '目标用户：').replace('Tech stack:', '技术栈：').replace('Deployment:', '部署方式：').replace('Region differences:', '区域差异：').replace('Marketing angles:', '营销卖点：')
  }

  return lines.join('\n')
}

function buildPosterPromptSystem(language: AiLanguage): string {
  return isChineseLanguage(language)
    ? '你是资深 B2B 增长设计师。请基于项目分析与营销简报，输出严格 JSON，字段必须包含 prompt, negative_prompt, title, subtitle, cta, layout_notes, rationale。prompt 必须适合文生图海报生成，突出产品卖点、现代 SaaS 工作台质感、清晰标题层级。'
    : 'You are a senior B2B growth designer. Return strict JSON with keys prompt, negative_prompt, title, subtitle, cta, layout_notes, rationale. The prompt must be production-ready for poster generation and emphasize product differentiation, a modern SaaS control room aesthetic, and strong headline hierarchy.'
}

function buildVideoPlanSystem(language: AiLanguage): string {
  return isChineseLanguage(language)
    ? '你是产品品牌导演。请基于项目分析与营销简报，输出严格 JSON，字段必须包含 headline, opening_hook, cover_prompt, narration, script_markdown, scenes。scenes 为数组，每项包含 title, visual_prompt, narration, subtitle。镜头数量控制在 4-6 个，适合 15-30 秒解说视频。'
    : 'You are a product brand director. Return strict JSON with headline, opening_hook, cover_prompt, narration, script_markdown, scenes. scenes must be an array of 4-6 items, each with title, visual_prompt, narration, subtitle, suitable for a 15-30 second explainer video.'
}

function buildAnalysisSystem(language: AiLanguage): string {
  return isChineseLanguage(language)
    ? '你是资深解决方案架构师和产品营销顾问。你会阅读整个代码仓库并输出严格 JSON。字段必须包含 product_name, product_summary, core_features, target_users, technical_stack, deployment_topology, region_differences, marketing_angles, module_topology。module_topology 为数组，每项包含 name, purpose, paths。禁止输出 Markdown，禁止解释。'
    : 'You are a senior solution architect and product marketing strategist. Read the repository bundle and return strict JSON only. Required keys: product_name, product_summary, core_features, target_users, technical_stack, deployment_topology, region_differences, marketing_angles, module_topology. module_topology must be an array of objects with name, purpose, paths. No markdown.'
}

async function getJobEnvelope(jobId: string): Promise<JobEnvelope> {
  const adapter = getDatabaseAdapter()
  const job = await adapter.getAiGenerationJobById(jobId)
  if (!job) {
    throw new Error(`AI job not found: ${jobId}`)
  }

  const assets = await hydrateAiAssetUrls(await adapter.listAiAssetsByJobId(jobId))
  const analysisId = job.output_payload?.analysis_id || job.analysis_id
  const briefId = job.output_payload?.brief_id || job.brief_id
  const analysis = analysisId ? await adapter.getAiProjectAnalysisById(analysisId) : null
  const brief = briefId ? await adapter.getAiCreativeBriefById(briefId) : null

  return { job, assets, analysis, brief }
}

async function createOrReuseBrief(job: AiGenerationJob, language: AiLanguage, analysis: AiProjectAnalysis, briefPayload?: Partial<AiCreativeBriefPayload>): Promise<AiCreativeBrief> {
  const adapter = getDatabaseAdapter()
  if (job.brief_id) {
    const brief = await adapter.getAiCreativeBriefById(job.brief_id)
    if (brief) {
      return brief
    }
  }

  const normalized = normalizeBriefPayload(language, briefPayload)
  const mergedSellingPoints = normalized.core_selling_points.length > 0
    ? normalized.core_selling_points
    : analysis.analysis_payload.marketing_angles

  return adapter.createAiCreativeBrief({
    analysis_id: analysis.id,
    region: job.region,
    language,
    audience: normalized.audience,
    core_selling_points: mergedSellingPoints,
    brand_tone: normalized.brand_tone,
    must_include: normalized.must_include,
    must_avoid: normalized.must_avoid,
    cta: normalized.cta,
    poster_goal: normalized.poster_goal,
    style_preset: normalized.style_preset,
    extra_notes: normalized.extra_notes,
    created_by: job.created_by,
  })
}

async function createAnalysisRecord(job: AiGenerationJob, request: RepoAnalysisRequest): Promise<AiProjectAnalysis> {
  const adapter = getDatabaseAdapter()
  const language = request.language
  const bundle = await buildRepoContextBundle(request.repo_scope)
  const analysisPayload = await generateStructuredJson({
    region: job.region,
    language,
    model: job.provider_model,
    systemPrompt: buildAnalysisSystem(language),
    userPrompt: `${isChineseLanguage(language) ? '请分析下面的仓库代码上下文并给出结构化结果。' : 'Analyze the following repository context and produce a structured response.'}\n\nRepo digest: ${bundle.repoDigest}\nFiles: ${bundle.fileCount}\nTruncated: ${bundle.truncated}\n\n${bundle.combinedText}`,
  })

  const normalizedPayload = normalizeAnalysisPayload(analysisPayload)
  const summaryText = buildAnalysisSummaryText(normalizedPayload, language)
  const analysis = await adapter.createAiProjectAnalysis({
    region: job.region,
    language,
    repo_scope: bundle.repoScope,
    repo_digest: bundle.repoDigest,
    analysis_payload: normalizedPayload,
    summary_text: summaryText,
    created_by: job.created_by,
  })

  await persistAiTextAsset({
    region: job.region,
    jobId: job.id,
    assetType: 'analysis',
    fileName: `analysis-${analysis.id}.json`,
    mimeType: 'application/json',
    text: JSON.stringify({
      analysis,
      repo_context: {
        repo_digest: bundle.repoDigest,
        file_count: bundle.fileCount,
        truncated: bundle.truncated,
      },
    }, null, 2),
    metadata: {
      analysis_id: analysis.id,
    },
  })

  return analysis
}

async function ensureAnalysisForJob(job: AiGenerationJob): Promise<AiProjectAnalysis> {
  const adapter = getDatabaseAdapter()
  const requestedLanguage = (job.input_payload.language || job.language) as AiLanguage

  if (job.analysis_id) {
    const analysis = await adapter.getAiProjectAnalysisById(job.analysis_id)
    if (analysis) {
      return analysis
    }
  }

  const outputAnalysisId = job.output_payload?.analysis_id
  if (outputAnalysisId) {
    const analysis = await adapter.getAiProjectAnalysisById(outputAnalysisId)
    if (analysis) {
      return analysis
    }
  }

  const latest = await adapter.listAiProjectAnalyses({
    region: job.region,
    language: requestedLanguage,
    created_by: job.created_by,
    limit: 1,
    offset: 0,
  })

  if (latest[0]) {
    return latest[0]
  }

  return createAnalysisRecord(job, {
    language: requestedLanguage,
    repo_scope: job.input_payload.repo_scope,
  })
}

function buildPosterPromptUser(language: AiLanguage, analysis: AiProjectAnalysis, brief: AiCreativeBrief, request: PosterGenerationRequest): string {
  return JSON.stringify({
    language,
    project_analysis: analysis.analysis_payload,
    analysis_summary: analysis.summary_text,
    creative_brief: brief,
    poster_request: request,
  }, null, 2)
}

function buildVideoPromptUser(language: AiLanguage, analysis: AiProjectAnalysis, brief: AiCreativeBrief, request: VideoGenerationRequest): string {
  return JSON.stringify({
    language,
    project_analysis: analysis.analysis_payload,
    analysis_summary: analysis.summary_text,
    creative_brief: brief,
    video_request: request,
  }, null, 2)
}

function buildSubtitleText(videoPlan: any): string {
  const scenes = Array.isArray(videoPlan?.scenes) ? videoPlan.scenes : []
  return scenes.map((scene: any, index: number) => `${index + 1}. ${scene.subtitle || scene.narration || ''}`).join('\n')
}

async function finalizeImageJob(job: AiGenerationJob, remoteUrl: string | undefined, bytes: Buffer | undefined, mimeType: string | undefined, outputPayload: Record<string, any>) {
  const imageAsset = remoteUrl
    ? await persistRemoteAiAsset({
        region: job.region,
        jobId: job.id,
        assetType: 'image',
        fileName: `poster-${job.id}.png`,
        mimeType: mimeType || 'image/png',
        remoteUrl,
        metadata: { prompt_bundle: outputPayload.prompt_bundle },
      })
    : await persistAiBinaryAsset({
        region: job.region,
        jobId: job.id,
        assetType: 'image',
        fileName: `poster-${job.id}.png`,
        mimeType: mimeType || 'image/png',
        bytes: bytes || Buffer.alloc(0),
        metadata: { prompt_bundle: outputPayload.prompt_bundle },
      })

  const adapter = getDatabaseAdapter()
  return adapter.updateAiGenerationJob(job.id, {
    status: 'completed',
    progress: 100,
    completed_at: new Date().toISOString(),
    external_task_id: undefined,
    output_payload: mergePayload(outputPayload, {
      image_asset_id: imageAsset.id,
    }),
  })
}

async function processPosterJob(job: AiGenerationJob): Promise<AiGenerationJob> {
  const adapter = getDatabaseAdapter()
  const analysis = await ensureAnalysisForJob(job)
  const language = (job.input_payload.language || analysis.language || resolveAiLanguage(job.region)) as AiLanguage
  const request = job.input_payload.request as PosterGenerationRequest
  const brief = await createOrReuseBrief(job, language, analysis, job.input_payload.brief)
  const outputPayload = mergePayload(job.output_payload, {
    analysis_id: analysis.id,
    brief_id: brief.id,
  })

  let promptBundle = outputPayload.prompt_bundle
  if (!promptBundle) {
    promptBundle = await generateStructuredJson({
      region: job.region,
      language,
      systemPrompt: buildPosterPromptSystem(language),
      userPrompt: buildPosterPromptUser(language, analysis, brief, request),
    })

    await adapter.updateAiGenerationJob(job.id, {
      status: 'in_progress',
      progress: 30,
      output_payload: mergePayload(outputPayload, { prompt_bundle: promptBundle }),
    })
  }

  if (!job.external_task_id) {
    const submission = await submitPosterGeneration({
      region: job.region,
      prompt: promptBundle.prompt,
      negativePrompt: promptBundle.negative_prompt,
      aspectRatio: request.aspect_ratio,
      model: job.provider_model,
    })

    if (submission.status === 'completed') {
      return finalizeImageJob(job, submission.remoteUrl, submission.bytes, submission.mimeType, mergePayload(outputPayload, { prompt_bundle: promptBundle }))
    }

    return adapter.updateAiGenerationJob(job.id, {
      status: 'in_progress',
      progress: 65,
      external_task_id: submission.taskId,
      output_payload: mergePayload(outputPayload, {
        prompt_bundle: promptBundle,
        provider_submission: submission.raw,
      }),
    })
  }

  const poll = await pollPosterGeneration({
    region: job.region,
    provider: job.provider,
    model: job.provider_model,
    taskId: job.external_task_id,
  })

  if (poll.status === 'pending') {
    const nowIso = new Date().toISOString()
    const pendingSinceRaw = outputPayload?.pending_since
    const pendingSinceMs = typeof pendingSinceRaw === 'string' ? Date.parse(pendingSinceRaw) : NaN
    const effectiveSinceMs = Number.isFinite(pendingSinceMs) ? pendingSinceMs : Date.now()
    const elapsedMs = Date.now() - effectiveSinceMs
    const timeoutMs = 8 * 60 * 1000

    if (!pendingSinceRaw || !Number.isFinite(pendingSinceMs)) {
      return adapter.updateAiGenerationJob(job.id, {
        status: 'in_progress',
        progress: 85,
        output_payload: mergePayload(outputPayload, {
          prompt_bundle: promptBundle,
          pending_since: nowIso,
          provider_poll: poll.raw,
        }),
      })
    }

    if (elapsedMs > timeoutMs) {
      const providerStatus = poll.raw?.output?.task_status || poll.raw?.task_status || 'PENDING'
      return adapter.updateAiGenerationJob(job.id, {
        status: 'failed',
        progress: 100,
        error_message: `Poster generation timed out after ${Math.round(elapsedMs / 60000)} minutes. Provider status: ${providerStatus}`,
        output_payload: mergePayload(outputPayload, {
          prompt_bundle: promptBundle,
          pending_since: pendingSinceRaw,
          provider_poll: poll.raw,
        }),
      })
    }

    return adapter.updateAiGenerationJob(job.id, {
      status: 'in_progress',
      progress: 85,
      output_payload: mergePayload(outputPayload, {
        prompt_bundle: promptBundle,
        pending_since: pendingSinceRaw,
        provider_poll: poll.raw,
      }),
    })
  }
  if (poll.status === 'failed') {
    return adapter.updateAiGenerationJob(job.id, {
      status: 'failed',
      progress: 100,
      error_message: poll.errorMessage || 'Poster generation failed',
      output_payload: mergePayload(outputPayload, { prompt_bundle: promptBundle, provider_poll: poll.raw }),
    })
  }

  return finalizeImageJob(job, poll.remoteUrl, poll.bytes, poll.mimeType, mergePayload(outputPayload, { prompt_bundle: promptBundle, provider_poll: poll.raw }))
}

async function ensureCoverAsset(job: AiGenerationJob, prompt: string, aspectRatio: '16:9' | '9:16', outputPayload: Record<string, any>): Promise<{ coverAssetId?: string; outputPayload: Record<string, any>; pending: boolean }> {
  const adapter = getDatabaseAdapter()
  if (outputPayload.cover_asset_id) {
    return { coverAssetId: outputPayload.cover_asset_id, outputPayload, pending: false }
  }

  if (!outputPayload.cover_generation) {
    const submission = await submitPosterGeneration({
      region: job.region,
      prompt,
      aspectRatio,
    })

    if (submission.status === 'completed') {
      const coverAsset = submission.remoteUrl
        ? await persistRemoteAiAsset({
            region: job.region,
            jobId: job.id,
            assetType: 'cover',
            fileName: `cover-${job.id}.png`,
            mimeType: submission.mimeType || 'image/png',
            remoteUrl: submission.remoteUrl,
            metadata: { kind: 'video_cover' },
          })
        : await persistAiBinaryAsset({
            region: job.region,
            jobId: job.id,
            assetType: 'cover',
            fileName: `cover-${job.id}.png`,
            mimeType: submission.mimeType || 'image/png',
            bytes: submission.bytes || Buffer.alloc(0),
            metadata: { kind: 'video_cover' },
          })

      return {
        coverAssetId: coverAsset.id,
        outputPayload: mergePayload(outputPayload, { cover_asset_id: coverAsset.id }),
        pending: false,
      }
    }

    const nextPayload = mergePayload(outputPayload, {
      cover_generation: {
        task_id: submission.taskId,
        prompt,
      },
    })

    await adapter.updateAiGenerationJob(job.id, {
      status: 'in_progress',
      progress: 45,
      output_payload: nextPayload,
    })

    return { outputPayload: nextPayload, pending: true }
  }

  const poll = await pollPosterGeneration({
    region: job.region,
    provider: job.region === 'CN' ? 'aliyun-wanx-image' : 'openai',
    model: job.provider_model,
    taskId: outputPayload.cover_generation.task_id,
  })

  if (poll.status === 'pending') {
    const nowIso = new Date().toISOString()
    const pendingSinceRaw = outputPayload?.pending_since
    const pendingSinceMs = typeof pendingSinceRaw === 'string' ? Date.parse(pendingSinceRaw) : NaN
    const effectiveSinceMs = Number.isFinite(pendingSinceMs) ? pendingSinceMs : Date.now()
    const elapsedMs = Date.now() - effectiveSinceMs
    const timeoutMs = 8 * 60 * 1000

    if (!pendingSinceRaw || !Number.isFinite(pendingSinceMs)) {
      return adapter.updateAiGenerationJob(job.id, {
        status: 'in_progress',
        progress: 85,
        output_payload: mergePayload(outputPayload, {
          prompt_bundle: promptBundle,
          pending_since: nowIso,
          provider_poll: poll.raw,
        }),
      })
    }

    if (elapsedMs > timeoutMs) {
      const providerStatus = poll.raw?.output?.task_status || poll.raw?.task_status || 'PENDING'
      return adapter.updateAiGenerationJob(job.id, {
        status: 'failed',
        progress: 100,
        error_message: `Poster generation timed out after ${Math.round(elapsedMs / 60000)} minutes. Provider status: ${providerStatus}`,
        output_payload: mergePayload(outputPayload, {
          prompt_bundle: promptBundle,
          pending_since: pendingSinceRaw,
          provider_poll: poll.raw,
        }),
      })
    }

    return adapter.updateAiGenerationJob(job.id, {
      status: 'in_progress',
      progress: 85,
      output_payload: mergePayload(outputPayload, {
        prompt_bundle: promptBundle,
        pending_since: pendingSinceRaw,
        provider_poll: poll.raw,
      }),
    })
  }
  if (poll.status === 'failed') {
    throw new Error(poll.errorMessage || 'Video cover generation failed')
  }

  const coverAsset = poll.remoteUrl
    ? await persistRemoteAiAsset({
        region: job.region,
        jobId: job.id,
        assetType: 'cover',
        fileName: `cover-${job.id}.png`,
        mimeType: poll.mimeType || 'image/png',
        remoteUrl: poll.remoteUrl,
        metadata: { kind: 'video_cover' },
      })
    : await persistAiBinaryAsset({
        region: job.region,
        jobId: job.id,
        assetType: 'cover',
        fileName: `cover-${job.id}.png`,
        mimeType: poll.mimeType || 'image/png',
        bytes: poll.bytes || Buffer.alloc(0),
        metadata: { kind: 'video_cover' },
      })

  const nextPayload = mergePayload(outputPayload, {
    cover_asset_id: coverAsset.id,
    cover_generation: undefined,
  })

  await adapter.updateAiGenerationJob(job.id, {
    status: 'in_progress',
    progress: 55,
    output_payload: nextPayload,
  })

  return {
    coverAssetId: coverAsset.id,
    outputPayload: nextPayload,
    pending: false,
  }
}

async function finalizeVideoJob(job: AiGenerationJob, remoteUrl: string | undefined, bytes: Buffer | undefined, mimeType: string | undefined, outputPayload: Record<string, any>) {
  const videoAsset = remoteUrl
    ? await persistRemoteAiAsset({
        region: job.region,
        jobId: job.id,
        assetType: 'video',
        fileName: `video-${job.id}.mp4`,
        mimeType: mimeType || 'video/mp4',
        remoteUrl,
        metadata: { video_plan: outputPayload.video_plan },
      })
    : await persistAiBinaryAsset({
        region: job.region,
        jobId: job.id,
        assetType: 'video',
        fileName: `video-${job.id}.mp4`,
        mimeType: mimeType || 'video/mp4',
        bytes: bytes || Buffer.alloc(0),
        metadata: { video_plan: outputPayload.video_plan },
      })

  const adapter = getDatabaseAdapter()
  return adapter.updateAiGenerationJob(job.id, {
    status: 'completed',
    progress: 100,
    completed_at: new Date().toISOString(),
    external_task_id: undefined,
    output_payload: mergePayload(outputPayload, {
      video_asset_id: videoAsset.id,
    }),
  })
}

async function processVideoJob(job: AiGenerationJob): Promise<AiGenerationJob> {
  const adapter = getDatabaseAdapter()
  const analysis = await ensureAnalysisForJob(job)
  const language = (job.input_payload.language || analysis.language || resolveAiLanguage(job.region)) as AiLanguage
  const request = job.input_payload.request as VideoGenerationRequest
  const brief = await createOrReuseBrief(job, language, analysis, job.input_payload.brief)
  let outputPayload = mergePayload(job.output_payload, {
    analysis_id: analysis.id,
    brief_id: brief.id,
  })

  let videoPlan = outputPayload.video_plan
  if (!videoPlan) {
    videoPlan = await generateStructuredJson({
      region: job.region,
      language,
      systemPrompt: buildVideoPlanSystem(language),
      userPrompt: buildVideoPromptUser(language, analysis, brief, request),
    })

    const scriptAsset = await persistAiTextAsset({
      region: job.region,
      jobId: job.id,
      assetType: 'script',
      fileName: `script-${job.id}.md`,
      mimeType: 'text/markdown',
      text: videoPlan.script_markdown || videoPlan.narration || '',
      metadata: { kind: 'video_script' },
    })
    const subtitleAsset = await persistAiTextAsset({
      region: job.region,
      jobId: job.id,
      assetType: 'subtitle',
      fileName: `subtitle-${job.id}.srt`,
      mimeType: 'text/plain',
      text: buildSubtitleText(videoPlan),
      metadata: { kind: 'video_subtitle' },
    })

    outputPayload = mergePayload(outputPayload, {
      video_plan: videoPlan,
      script_asset_id: scriptAsset.id,
      subtitle_asset_id: subtitleAsset.id,
    })

    await adapter.updateAiGenerationJob(job.id, {
      status: 'in_progress',
      progress: 25,
      output_payload: outputPayload,
    })
  }

  const coverResult = await ensureCoverAsset(job, videoPlan.cover_prompt || videoPlan.opening_hook || request.headline, request.aspect_ratio, outputPayload)
  if (coverResult.pending) {
    return adapter.getAiGenerationJobById(job.id) as Promise<AiGenerationJob>
  }
  outputPayload = coverResult.outputPayload

  if (!job.external_task_id) {
    const submission = await submitVideoGeneration({
      region: job.region,
      prompt: request.script_override || videoPlan.narration || videoPlan.opening_hook || request.headline,
      aspectRatio: request.aspect_ratio,
      durationSeconds: request.duration_seconds,
      model: job.provider_model,
    })

    if (submission.status === 'completed') {
      return finalizeVideoJob(job, submission.remoteUrl, submission.bytes, submission.mimeType, mergePayload(outputPayload, {
        video_submission: submission.raw,
      }))
    }

    return adapter.updateAiGenerationJob(job.id, {
      status: 'in_progress',
      progress: 70,
      external_task_id: submission.taskId,
      output_payload: mergePayload(outputPayload, {
        video_submission: submission.raw,
      }),
    })
  }

  const poll = await pollVideoGeneration({
    region: job.region,
    provider: job.provider,
    model: job.provider_model,
    taskId: job.external_task_id,
  })

  if (poll.status === 'pending') {
    const nowIso = new Date().toISOString()
    const pendingSinceRaw = outputPayload?.pending_since
    const pendingSinceMs = typeof pendingSinceRaw === 'string' ? Date.parse(pendingSinceRaw) : NaN
    const effectiveSinceMs = Number.isFinite(pendingSinceMs) ? pendingSinceMs : Date.now()
    const elapsedMs = Date.now() - effectiveSinceMs
    const timeoutMs = 8 * 60 * 1000

    if (!pendingSinceRaw || !Number.isFinite(pendingSinceMs)) {
      return adapter.updateAiGenerationJob(job.id, {
        status: 'in_progress',
        progress: 85,
        output_payload: mergePayload(outputPayload, {
          prompt_bundle: promptBundle,
          pending_since: nowIso,
          provider_poll: poll.raw,
        }),
      })
    }

    if (elapsedMs > timeoutMs) {
      const providerStatus = poll.raw?.output?.task_status || poll.raw?.task_status || 'PENDING'
      return adapter.updateAiGenerationJob(job.id, {
        status: 'failed',
        progress: 100,
        error_message: `Poster generation timed out after ${Math.round(elapsedMs / 60000)} minutes. Provider status: ${providerStatus}`,
        output_payload: mergePayload(outputPayload, {
          prompt_bundle: promptBundle,
          pending_since: pendingSinceRaw,
          provider_poll: poll.raw,
        }),
      })
    }

    return adapter.updateAiGenerationJob(job.id, {
      status: 'in_progress',
      progress: 85,
      output_payload: mergePayload(outputPayload, {
        prompt_bundle: promptBundle,
        pending_since: pendingSinceRaw,
        provider_poll: poll.raw,
      }),
    })
  }
  if (poll.status === 'failed') {
    return adapter.updateAiGenerationJob(job.id, {
      status: 'failed',
      progress: 100,
      error_message: poll.errorMessage || 'Video generation failed',
      output_payload: mergePayload(outputPayload, { video_poll: poll.raw }),
    })
  }

  return finalizeVideoJob(job, poll.remoteUrl, poll.bytes, poll.mimeType, mergePayload(outputPayload, { video_poll: poll.raw }))
}

export async function createRepoAnalysisJob(input: RepoAnalysisRequest, createdBy: string) {
  const adapter = getDatabaseAdapter()
  const region = resolveAiRegion()
  const route = resolveAiProviderRoute(region)
  const language = input.language || resolveAiLanguage(region)

  return adapter.createAiGenerationJob({
    region,
    language,
    job_type: 'repo_analysis',
    provider: route.analysisProvider,
    provider_model: route.analysisModel,
    input_payload: {
      language,
      repo_scope: input.repo_scope,
    },
    created_by: createdBy,
  })
}

export async function createPosterJob(input: PosterGenerationRequest, createdBy: string) {
  const adapter = getDatabaseAdapter()
  const region = resolveAiRegion()
  const route = resolveAiProviderRoute(region)
  const language = resolveAiLanguage(region)

  return adapter.createAiGenerationJob({
    analysis_id: input.analysis_id,
    brief_id: input.brief_id,
    region,
    language,
    job_type: 'poster',
    provider: route.posterProvider,
    provider_model: route.posterModel,
    input_payload: {
      language,
      request: input,
      brief: input.brief,
    },
    created_by: createdBy,
  })
}

export async function createVideoJob(input: VideoGenerationRequest, createdBy: string) {
  const adapter = getDatabaseAdapter()
  const region = resolveAiRegion()
  const route = resolveAiProviderRoute(region)
  const language = resolveAiLanguage(region)

  return adapter.createAiGenerationJob({
    analysis_id: input.analysis_id,
    brief_id: input.brief_id,
    region,
    language,
    job_type: 'video',
    provider: route.videoProvider,
    provider_model: route.videoModel,
    input_payload: {
      language,
      request: input,
      brief: input.brief,
    },
    created_by: createdBy,
  })
}

export async function processAiJob(jobId: string): Promise<JobEnvelope> {
  const adapter = getDatabaseAdapter()
  const envelope = await getJobEnvelope(jobId)
  const { job } = envelope

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'blocked') {
    return getJobEnvelope(jobId)
  }

  try {
    let updatedJob: AiGenerationJob
    if (job.job_type === 'repo_analysis') {
      const analysis = await createAnalysisRecord(job, job.input_payload as RepoAnalysisRequest)
      updatedJob = await adapter.updateAiGenerationJob(job.id, {
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        output_payload: mergePayload(job.output_payload, {
          analysis_id: analysis.id,
          summary_text: analysis.summary_text,
        }),
      })
    } else if (job.job_type === 'poster') {
      updatedJob = await processPosterJob(job)
    } else {
      updatedJob = await processVideoJob(job)
    }

    return getJobEnvelope(updatedJob.id)
  } catch (error: any) {
    await adapter.updateAiGenerationJob(job.id, {
      status: 'failed',
      progress: 100,
      error_message: error?.message || 'AI job failed',
    })
    return getJobEnvelope(job.id)
  }
}

export async function listAiJobs() {
  const adapter = getDatabaseAdapter()
  const jobs = await adapter.listAiGenerationJobs({ limit: 100, offset: 0 })
  return Promise.all(jobs.map(async (job) => getJobEnvelope(job.id)))
}

export async function getAiJob(jobId: string) {
  return getJobEnvelope(jobId)
}

export async function regenerateFromAsset(assetId: string, request: AssetRegenerateRequest, createdBy: string) {
  const jobs = await listAiJobs()
  const match = jobs.find((entry) => entry.assets.some((asset) => asset.id === assetId))
  if (!match) {
    throw new Error(`AI asset not found: ${assetId}`)
  }

  if (match.job.job_type !== 'poster') {
    throw new Error('Only poster regeneration is supported in v1')
  }

  const originalRequest = match.job.input_payload.request as PosterGenerationRequest
  return createPosterJob({
    ...originalRequest,
    extra_prompt: [originalRequest.extra_prompt, request.supplemental_prompt].filter(Boolean).join('\n'),
    analysis_id: match.analysis?.id || originalRequest.analysis_id,
  }, createdBy)
}


