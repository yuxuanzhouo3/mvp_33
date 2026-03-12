
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlignLeft,
  CheckCircle2,
  CheckSquare,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Mic,
  Palette,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Square,
  Terminal,
  Video,
  Volume2,
  X,
} from 'lucide-react'
import type { AiAsset, AiGenerationJob, AiLanguage, AiProjectAnalysis } from '@/lib/admin/types'
import type { AiProviderRoute } from '@/lib/admin/ai/provider-router'

type FeatureItem = {
  id: string
  name: string
  value: string
  selected: boolean
  source: 'analysis' | 'manual'
}

type JobEnvelope = {
  job: AiGenerationJob
  assets: AiAsset[]
  analysis: AiProjectAnalysis | null
  brief: any
}

const imageStyles = [
  '科技写实风 (Tech Realism)',
  '极简商务风 (Minimalist)',
  '材质光影风 (Material Light)',
  '杂志拼贴风 (Editorial Collage)',
]

const videoVoices = [
  '专业沉稳男声 (商务解说)',
  '亲切自然女声 (产品讲解)',
  '自信清晰男声 (品牌宣传)',
]

const defaultImagePrompt =
  '你是资深商业视觉设计师。请把我提供的功能价值转化为具有冲击力的品牌海报画面，画面主体明确、层级清晰，禁止出现乱码文字，突出效率提升与可信科技感。'

const defaultVideoPrompt =
  '你是一位资深品牌导演。请用专业且可信的口吻编写分镜和旁白，强调真实业务场景和产品价值，避免夸张推销语。'

const defaultRepoScope = ['app', 'lib', 'actions', 'components', 'config', 'hooks', 'types', 'scripts', 'docs', 'docsll']

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const json = await response.json()
  if (!json.success) {
    throw new Error(json.error || 'Request failed')
  }
  return json
}

function buildFeaturesFromAnalysis(analysis: AiProjectAnalysis): FeatureItem[] {
  const core = analysis.analysis_payload.core_features || []
  const angles = analysis.analysis_payload.marketing_angles || []
  const max = Math.max(core.length, angles.length)
  const items: FeatureItem[] = []

  for (let index = 0; index < max; index += 1) {
    const name = core[index] || `核心功能 ${index + 1}`
    const value = angles[index] || ''
    items.push({
      id: createId(),
      name,
      value,
      selected: true,
      source: 'analysis',
    })
  }

  return items
}

function formatFeatureLine(feature: FeatureItem) {
  const parts = [feature.name, feature.value].filter(Boolean)
  return parts.join(': ')
}

export default function AiStudioClient({ region: _region, language, route: _route }: { region: 'CN' | 'INTL'; language: AiLanguage; route: AiProviderRoute }) {
  const [projectName, setProjectName] = useState('未分析项目')
  const [projectSummary, setProjectSummary] = useState('')
  const [analysis, setAnalysis] = useState<AiProjectAnalysis | null>(null)
  const [features, setFeatures] = useState<FeatureItem[]>([])

  const [activeMode, setActiveMode] = useState<'image' | 'video'>('image')

  const [imgStyle, setImgStyle] = useState(imageStyles[0])
  const [imgSystemPrompt, setImgSystemPrompt] = useState(defaultImagePrompt)

  const [vidVoice, setVidVoice] = useState(videoVoices[0])
  const [vidSystemPrompt, setVidSystemPrompt] = useState(defaultVideoPrompt)

  const [analysisJob, setAnalysisJob] = useState<JobEnvelope | null>(null)
  const [posterJob, setPosterJob] = useState<JobEnvelope | null>(null)
  const [videoJob, setVideoJob] = useState<JobEnvelope | null>(null)
  const [submitting, setSubmitting] = useState<null | 'analysis' | 'poster' | 'video'>(null)

  const pollersRef = useRef<{ analysis?: () => void; poster?: () => void; video?: () => void }>({})

  const selectedFeatures = useMemo(
    () => features.filter((feature) => feature.selected && (feature.name.trim() || feature.value.trim())),
    [features],
  )

  const hasSelectedFeatures = selectedFeatures.length > 0
  const allSelected = features.length > 0 && features.every((feature) => feature.selected)

  const posterAsset = posterJob?.assets.find((asset) => asset.asset_type === 'image') || null
  const videoAsset = videoJob?.assets.find((asset) => asset.asset_type === 'video') || null
  const coverAsset = videoJob?.assets.find((asset) => asset.asset_type === 'cover') || null

  useEffect(() => () => {
    Object.values(pollersRef.current).forEach((stop) => stop?.())
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadLatestAnalysis = async () => {
      try {
        const json = await requestJson('/api/admin/ai/jobs')
        const jobs = (json.jobs || []) as JobEnvelope[]
        const latestAnalysisJob = jobs
          .filter((entry) => entry.job.job_type === 'repo_analysis')
          .sort((a, b) => new Date(b.job.updated_at).getTime() - new Date(a.job.updated_at).getTime())[0]

        if (!latestAnalysisJob || cancelled) return

        setAnalysisJob(latestAnalysisJob)
        if (latestAnalysisJob.analysis) {
          applyAnalysis(latestAnalysisJob.analysis)
        }

        if (['queued', 'in_progress'].includes(latestAnalysisJob.job.status)) {
          startPolling('analysis', latestAnalysisJob.job.id)
        }
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || '加载最新分析失败')
        }
      }
    }

    void loadLatestAnalysis()
    return () => {
      cancelled = true
    }
  }, [])

  function applyAnalysis(nextAnalysis: AiProjectAnalysis) {
    setAnalysis(nextAnalysis)
    setProjectName(nextAnalysis.analysis_payload.product_name || '未命名项目')
    setProjectSummary(nextAnalysis.analysis_payload.product_summary || '')
    setFeatures(buildFeaturesFromAnalysis(nextAnalysis))
  }

  function handleSelectAll() {
    if (features.length === 0) return
    const next = !allSelected
    setFeatures((current) => current.map((feature) => ({ ...feature, selected: next })))
  }

  function handleAddFeature() {
    setFeatures((current) => [
      ...current,
      { id: createId(), name: '', value: '', selected: true, source: 'manual' },
    ])
  }

  function handleDeleteFeature(id: string) {
    setFeatures((current) => current.filter((feature) => feature.id !== id))
  }

  function handleTextChange(id: string, field: 'name' | 'value', value: string) {
    setFeatures((current) =>
      current.map((feature) => (feature.id === id ? { ...feature, [field]: value } : feature)),
    )
  }

  function startPolling(kind: 'analysis' | 'poster' | 'video', jobId: string) {
    pollersRef.current[kind]?.()
    let cancelled = false

    const stop = () => {
      cancelled = true
    }

    pollersRef.current[kind] = stop

    const tick = async () => {
      if (cancelled) return
      try {
        const data = (await requestJson(`/api/admin/ai/jobs/${jobId}`)) as JobEnvelope

        if (kind === 'analysis') {
          setAnalysisJob(data)
          if (data.analysis) {
            applyAnalysis(data.analysis)
          }
        }

        if (kind === 'poster') {
          setPosterJob(data)
        }

        if (kind === 'video') {
          setVideoJob(data)
        }

        if (['completed', 'failed', 'blocked'].includes(data.job.status)) {
          setSubmitting(null)
          return
        }

        setTimeout(tick, 3000)
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || '轮询失败')
          setTimeout(tick, 4000)
        }
      }
    }

    void tick()
  }

  async function handleAnalyzeProject() {
    setSubmitting('analysis')
    try {
      const json = await requestJson('/api/admin/ai/repo-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, repo_scope: defaultRepoScope }),
      })

      if (json.jobId) {
        setAnalysisJob({ job: json.job, assets: [], analysis: null, brief: null })
        startPolling('analysis', json.jobId)
      }
    } catch (error: any) {
      setSubmitting(null)
      toast.error(error?.message || '分析失败')
    }
  }

  function buildBriefPayload(extraNotes: string) {
    const sellingPoints = selectedFeatures.map(formatFeatureLine).filter(Boolean)
    return {
      audience: '企业客户、团队管理者、业务负责人',
      core_selling_points: sellingPoints,
      brand_tone: '专业、可信、现代',
      must_include: [],
      must_avoid: [],
      cta: '立即体验',
      extra_notes: extraNotes,
    }
  }

  async function handleGeneratePoster() {
    if (!hasSelectedFeatures) return

    const featureContext = selectedFeatures.map((feature) => `- ${formatFeatureLine(feature)}`).join('\n')
    const extraPrompt = [imgSystemPrompt, '业务要点:', featureContext].filter(Boolean).join('\n\n')

    const payload = {
      analysis_id: analysis?.id,
      poster_goal: '产品宣发海报',
      audience: '企业客户、合作伙伴、评审',
      style: imgStyle,
      aspect_ratio: '4:5',
      title: analysis?.analysis_payload.product_name || projectName || '产品',
      subtitle: analysis?.analysis_payload.product_summary || projectSummary || '',
      cta: '立即体验',
      extra_prompt: extraPrompt,
      negative_prompt: '',
      brief: buildBriefPayload(extraPrompt),
    }

    setSubmitting('poster')
    try {
      const json = await requestJson('/api/admin/ai/posters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (json.jobId) {
        setPosterJob({ job: json.job, assets: [], analysis: null, brief: null })
        startPolling('poster', json.jobId)
      }
    } catch (error: any) {
      setSubmitting(null)
      toast.error(error?.message || '海报生成失败')
    }
  }

  async function handleGenerateVideo() {
    if (!hasSelectedFeatures) return

    const featureContext = selectedFeatures.map((feature) => `- ${formatFeatureLine(feature)}`).join('\n')
    const extraPrompt = [
      vidSystemPrompt,
      `配音音色: ${vidVoice}`,
      '业务要点:',
      featureContext,
    ]
      .filter(Boolean)
      .join('\n\n')

    const payload = {
      analysis_id: analysis?.id,
      aspect_ratio: '9:16',
      duration_seconds: 10,
      headline: analysis?.analysis_payload.product_name || projectName || '产品解说',
      script_override: '',
      extra_prompt: extraPrompt,
      brief: buildBriefPayload(extraPrompt),
    }

    setSubmitting('video')
    try {
      const json = await requestJson('/api/admin/ai/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (json.jobId) {
        setVideoJob({ job: json.job, assets: [], analysis: null, brief: null })
        startPolling('video', json.jobId)
      }
    } catch (error: any) {
      setSubmitting(null)
      toast.error(error?.message || '视频生成失败')
    }
  }

  const posterPrompt = posterJob?.job?.output_payload?.prompt_bundle?.prompt || ''
  const videoPlan = videoJob?.job?.output_payload?.video_plan || null

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-6 flex flex-col">
      <div className="max-w-[1400px] mx-auto w-full flex-1 flex flex-col gap-5">
        <header className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 flex items-center gap-3">
              <LayoutGrid className="w-7 h-7 text-cyan-600" />
              AI 创意中心
            </h1>
            <p className="mt-1 text-sm text-slate-500">从项目理解到海报与视频，统一生成与交付。</p>
          </div>
          <div className="text-sm font-medium text-cyan-700 bg-cyan-50 px-4 py-1.5 rounded-full border border-cyan-100">
            当前项目: {projectName}
          </div>
        </header>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-3 justify-between items-center">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-800">
                <Settings className="w-5 h-5 text-slate-500" />
                全局配置：AI 项目理解 + 业务功能微调
              </h2>
              <p className="text-xs text-slate-500 mt-1">系统会读取 docs / docsll 中的说明文档，生成核心功能列表。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleAnalyzeProject}
                disabled={submitting === 'analysis'}
                className="flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                {submitting === 'analysis' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                理解项目
              </button>
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-900 transition-colors bg-cyan-50 px-3 py-1.5 rounded-md"
                disabled={features.length === 0}
              >
                {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {allSelected ? '取消全选' : '全选所有'}
              </button>
            </div>
          </div>

          <div className="px-4 pt-3 pb-2 text-xs text-slate-500 flex flex-wrap gap-3 items-center">
            <span>分析状态: {analysisJob?.job?.status || 'idle'}</span>
            {analysisJob?.job?.status && (
              <span>进度 {analysisJob?.job?.progress || 0}%</span>
            )}
            {analysisJob?.job?.error_message && (
              <span className="text-rose-500">{analysisJob.job.error_message}</span>
            )}
          </div>

          {projectSummary && (
            <div className="mx-4 mb-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600">
              {projectSummary}
            </div>
          )}

          <div className="max-h-[240px] overflow-y-auto p-2">
            <div className="flex flex-col gap-1.5">
              {features.length === 0 && (
                <div className="p-4 text-sm text-slate-500">暂无功能列表，请先点击“理解项目”。</div>
              )}
              {features.map((feature) => (
                <div
                  key={feature.id}
                  className={`flex items-start md:items-center gap-3 p-3 rounded-lg border transition-all duration-200 group ${
                    feature.selected
                      ? 'border-cyan-200 bg-cyan-50/40 shadow-sm'
                      : 'border-slate-100 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="pt-0.5 md:pt-0">
                    <input
                      type="checkbox"
                      checked={feature.selected}
                      onChange={() =>
                        setFeatures((current) =>
                          current.map((item) =>
                            item.id === feature.id ? { ...item, selected: !item.selected } : item,
                          ),
                        )
                      }
                      className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 w-full">
                    <div className="md:col-span-3 flex items-center">
                      <input
                        className={`font-semibold text-sm bg-transparent border-b border-dashed focus:outline-none w-full ${
                          feature.selected ? 'text-slate-900 border-cyan-200' : 'text-slate-600 border-slate-200'
                        }`}
                        value={feature.name}
                        onChange={(event) => handleTextChange(feature.id, 'name', event.target.value)}
                        placeholder="功能名称"
                      />
                    </div>
                    <div className="md:col-span-8 flex items-center">
                      <input
                        className={`text-sm bg-transparent border-b border-dashed focus:outline-none w-full ${
                          feature.selected ? 'text-slate-700 border-cyan-200' : 'text-slate-500 border-slate-200'
                        }`}
                        value={feature.value}
                        onChange={(event) => handleTextChange(feature.id, 'value', event.target.value)}
                        placeholder="一句话价值描述"
                      />
                    </div>
                    <div className="md:col-span-1 flex items-center justify-end">
                      <button
                        onClick={() => handleDeleteFeature(feature.id)}
                        className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                        title="删除此功能"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={handleAddFeature}
                className="w-full mt-1 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:text-cyan-700 hover:border-cyan-300 hover:bg-cyan-50 transition-all flex items-center justify-center gap-1.5 font-medium"
              >
                <Plus className="w-4 h-4" /> 添加自定义业务功能
              </button>
            </div>
          </div>
        </section>

        <div className="flex justify-center mt-2 mb-1">
          <div className="bg-slate-200/80 p-1.5 rounded-xl flex items-center gap-1 shadow-inner">
            <button
              onClick={() => setActiveMode('image')}
              className={`flex items-center gap-2 px-8 py-2.5 rounded-lg font-semibold text-sm transition-all duration-300 ${
                activeMode === 'image'
                  ? 'bg-white text-cyan-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300/50'
              }`}
            >
              <ImageIcon className="w-5 h-5" /> 宣发海报工作流
            </button>
            <button
              onClick={() => setActiveMode('video')}
              className={`flex items-center gap-2 px-8 py-2.5 rounded-lg font-semibold text-sm transition-all duration-300 ${
                activeMode === 'video'
                  ? 'bg-slate-900 text-amber-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300/50'
              }`}
            >
              <Video className="w-5 h-5" /> 解说视频工作流
            </button>
          </div>
        </div>

        <div className="flex-1 w-full max-w-5xl mx-auto">
          {activeMode === 'image' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-cyan-50 to-white flex justify-between items-center">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-cyan-900">
                  <ImageIcon className="w-5 h-5 text-cyan-500" /> 产品宣发海报生成
                </h2>
              </div>

              <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Palette className="w-3 h-3" /> 视觉风格
                  </label>
                  <select
                    value={imgStyle}
                    onChange={(event) => setImgStyle(event.target.value)}
                    className="w-full p-2 text-sm border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    {imageStyles.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-white border border-cyan-100 rounded-lg overflow-hidden">
                  <div className="p-3 bg-cyan-50/50 border-b border-cyan-100">
                    <label className="block text-xs font-semibold text-cyan-700 mb-2 flex items-center gap-1">
                      <Terminal className="w-3 h-3" /> 基础设定 Prompt (系统指令)
                    </label>
                    <textarea
                      className="w-full text-xs text-slate-700 bg-white border border-cyan-200 rounded p-2 focus:ring-1 focus:ring-cyan-500 outline-none resize-none leading-relaxed"
                      rows={2}
                      value={imgSystemPrompt}
                      onChange={(event) => setImgSystemPrompt(event.target.value)}
                    />
                  </div>
                  <div className="p-3 bg-white">
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1 flex items-center gap-1 uppercase">
                      <AlignLeft className="w-3 h-3" /> 将随指令注入的业务数据：
                    </label>
                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 max-h-20 overflow-y-auto">
                      {hasSelectedFeatures ? (
                        <ul className="list-disc list-inside space-y-1">
                          {selectedFeatures.map((feature) => (
                            <li key={feature.id} className="truncate">
                              <span className="font-semibold">{feature.name}:</span> {feature.value}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-rose-400">尚未选择任何功能，生成将缺乏业务数据支撑。</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleGeneratePoster}
                  disabled={submitting === 'poster' || !hasSelectedFeatures}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2.5 rounded-lg flex justify-center items-center gap-2 transition-all disabled:opacity-50"
                >
                  {submitting === 'poster' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  生成海报
                </button>
              </div>

              <div className="p-5 flex-1 min-h-[350px] bg-white">
                {!posterJob && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                    <ImageIcon className="w-12 h-12 mb-2" />
                    <p className="text-sm">调整 Prompt 后点击生成</p>
                  </div>
                )}

                {posterJob && posterJob.job.status !== 'completed' && (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mb-3" />
                    <div className="text-xs font-semibold text-cyan-900 mb-1">{posterJob.job.progress || 0}%</div>
                    <p className="text-xs text-cyan-600">正在生成海报...</p>
                    {posterJob.job.error_message && (
                      <p className="mt-2 text-xs text-rose-500">{posterJob.job.error_message}</p>
                    )}
                  </div>
                )}

                {posterJob && posterJob.job.status === 'completed' && (
                  <div className="space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between gap-2 text-cyan-700 text-xs font-semibold bg-cyan-50 p-2 rounded">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> 成功生成
                      </div>
                      {posterAsset && (
                        <button
                          onClick={() => window.open(posterAsset.public_url, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700"
                        >
                          <Download className="w-4 h-4" /> 下载
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-5">
                      <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
                        <div className="relative aspect-video bg-slate-200">
                          {posterAsset ? (
                            <img src={posterAsset.public_url} alt="poster" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">无海报输出</div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/80 to-transparent p-2 pt-6 text-white">
                            <p className="font-semibold text-sm">{analysis?.analysis_payload.product_name || projectName}</p>
                          </div>
                        </div>
                        <div className="p-3 bg-white border-t border-slate-200">
                          <span className="text-[10px] text-cyan-600 font-semibold uppercase block mb-1">
                            AI 最终执行 Prompt
                          </span>
                          <p className="text-[10px] text-cyan-800 font-mono leading-relaxed bg-cyan-50 p-2 rounded border border-cyan-100 whitespace-pre-wrap">
                            {posterPrompt || '暂无 Prompt'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMode === 'video' && (
            <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-300">
              <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800 flex justify-between items-center">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-amber-300">
                  <Video className="w-5 h-5 text-amber-400" /> 解说视频分镜引擎
                </h2>
              </div>

              <div className="p-4 bg-slate-800/60 border-b border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
                    <Mic className="w-3 h-3" /> AI 配音音色
                  </label>
                  <select
                    value={vidVoice}
                    onChange={(event) => setVidVoice(event.target.value)}
                    className="w-full p-2 text-sm border border-slate-700 rounded-md bg-slate-900 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    {videoVoices.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-900 border border-amber-900/40 rounded-lg overflow-hidden">
                  <div className="p-3 bg-amber-900/20 border-b border-amber-900/30">
                    <label className="block text-xs font-semibold text-amber-300 mb-2 flex items-center gap-1">
                      <Terminal className="w-3 h-3" /> 脚本基调 Prompt (导演指令)
                    </label>
                    <textarea
                      className="w-full text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded p-2 focus:ring-1 focus:ring-amber-500 outline-none resize-none leading-relaxed"
                      rows={2}
                      value={vidSystemPrompt}
                      onChange={(event) => setVidSystemPrompt(event.target.value)}
                    />
                  </div>
                  <div className="p-3 bg-slate-900">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1 uppercase">
                      <AlignLeft className="w-3 h-3" /> 将被改写为分镜剧本的业务数据：
                    </label>
                    <div className="text-xs text-slate-400 bg-slate-800 p-2 rounded border border-slate-800 max-h-20 overflow-y-auto">
                      {hasSelectedFeatures ? (
                        <ul className="list-disc list-inside space-y-1">
                          {selectedFeatures.map((feature) => (
                            <li key={feature.id} className="truncate">
                              <span className="font-semibold text-slate-200">{feature.name}:</span> {feature.value}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-rose-300">尚未选择功能。</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleGenerateVideo}
                  disabled={submitting === 'video' || !hasSelectedFeatures}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold py-2.5 rounded-lg flex justify-center items-center gap-2 transition-all disabled:opacity-50"
                >
                  {submitting === 'video' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  生成视频分镜
                </button>
              </div>

              <div className="p-5 flex-1 min-h-[350px]">
                {!videoJob && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60">
                    <Video className="w-12 h-12 mb-2" />
                    <p className="text-sm">调整 Prompt 后生成分镜</p>
                  </div>
                )}

                {videoJob && videoJob.job.status !== 'completed' && (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-amber-400 animate-spin mb-3" />
                    <div className="text-xs font-semibold text-white mb-1">{videoJob.job.progress || 0}%</div>
                    <p className="text-xs text-amber-300">正在生成视频...</p>
                    {videoJob.job.error_message && (
                      <p className="mt-2 text-xs text-rose-300">{videoJob.job.error_message}</p>
                    )}
                  </div>
                )}

                {videoJob && videoJob.job.status === 'completed' && (
                  <div className="space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between gap-2 text-amber-300 text-xs font-semibold bg-slate-800 p-2 rounded">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> 成功生成
                      </div>
                      {videoAsset && (
                        <button
                          onClick={() => window.open(videoAsset.public_url, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300"
                        >
                          <Download className="w-4 h-4" /> 下载
                        </button>
                      )}
                    </div>

                    {coverAsset && (
                      <div className="rounded-xl overflow-hidden border border-slate-800">
                        <img src={coverAsset.public_url} alt="cover" className="w-full object-cover" />
                      </div>
                    )}

                    {videoAsset && (
                      <video src={videoAsset.public_url} controls className="w-full rounded-xl border border-slate-800" />
                    )}

                    {videoPlan?.scenes && (
                      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                        <div className="p-3 bg-slate-800 border-b border-slate-700 font-medium text-xs text-slate-300 flex justify-between">
                          <span>{videoPlan.headline || projectName}</span>
                          <span className="text-amber-300 flex items-center gap-1">
                            <Mic className="w-3 h-3" /> {vidVoice}
                          </span>
                        </div>
                        <div className="p-3 space-y-3">
                          {videoPlan.scenes.map((scene: any, index: number) => (
                            <div key={`${scene.title || 'scene'}-${index}`} className="flex gap-3 p-2.5 bg-slate-900/80 rounded-lg border border-slate-700/50">
                              <div className="flex-shrink-0 w-6 h-6 bg-amber-500/20 text-amber-200 rounded-full flex items-center justify-center font-semibold text-xs shadow-inner">
                                {index + 1}
                              </div>
                              <div className="flex-1 space-y-2">
                                <div>
                                  <span className="text-[10px] font-semibold text-slate-500 mb-0.5 block uppercase">画面 (Visual)</span>
                                  <p className="text-xs text-slate-300 bg-slate-800 p-1.5 rounded border border-slate-700">
                                    {scene.visual_prompt || scene.visual || scene.title || ''}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[10px] font-semibold text-emerald-300 mb-0.5 flex items-center gap-1 uppercase">
                                    <Volume2 className="w-3 h-3" /> 台词 (Audio)
                                  </span>
                                  <p className="text-xs text-emerald-100 bg-emerald-900/20 border border-emerald-900/40 p-1.5 rounded">
                                    {scene.narration || scene.audio || ''}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}



