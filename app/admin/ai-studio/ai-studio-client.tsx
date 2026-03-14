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
  X,
} from 'lucide-react'
import type { AiAsset, AiGenerationJob, AiLanguage, AiMarketingProfile } from '@/lib/admin/types'
import type { AiProviderRoute } from '@/lib/admin/ai/provider-router'

type FeatureItem = {
  id: string
  name: string
  value: string
  selected: boolean
}

type JobEnvelope = {
  job: AiGenerationJob
  assets: AiAsset[]
  analysis: any | null
  brief: any
}

const defaultMarketingProfile: AiMarketingProfile = {
  product_name: 'MornChat 企业协作工作台',
  product_summary: '聊天、文件、决策统一在一个空间，跨频道、跨设备协作更顺畅。',
  core_features: [
    '统一会话空间',
    '知识秒级检索',
    'AI 自动总结',
    '企业级安全',
    '多端连续体验',
    '结构化协作',
  ],
  marketing_angles: [
    '频道、私信与线程整合到一个入口。',
    '跨消息、文件和附件快速定位答案。',
    '把长讨论整理成要点和行动计划。',
    '权限控制、审计记录与合规策略一体化。',
    '网页、移动端与桌面端保持一致。',
    '固定决策、责任人和进度，一目了然。',
  ],
}

const imageStyles = ['科技写实风', '极简商务风', '材质光影风', '杂志拼贴风']

const videoVoices = ['专业沉稳男声', '亲切自然女声', '自信清晰男声']

const defaultImagePrompt =
  '你是资深商业视觉设计师。请把我提供的功能价值转化为具有冲击力的品牌海报画面，画面主体明确、层级清晰，禁止出现乱码文字，突出效率提升与可信科技感。'

const defaultVideoPrompt =
  '你是一位资深品牌导演。请用专业且可信的口吻编写分镜和旁白，强调真实业务场景和产品价值，避免夸张推销语。'

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

function buildFeaturesFromProfile(profile: AiMarketingProfile): FeatureItem[] {
  const core = profile.core_features || []
  const angles = profile.marketing_angles || []
  const max = Math.max(core.length, angles.length)
  const items: FeatureItem[] = []

  for (let index = 0; index < max; index += 1) {
    items.push({
      id: createId(),
      name: core[index] || `核心功能 ${index + 1}`,
      value: angles[index] || '',
      selected: true,
    })
  }

  return items
}

function buildProfileFromFeatures(base: AiMarketingProfile, items: FeatureItem[]): AiMarketingProfile {
  const core: string[] = []
  const angles: string[] = []

  items.forEach((item) => {
    const name = item.name.trim()
    const value = item.value.trim()
    if (!name && !value) return
    core.push(name || `核心功能 ${core.length + 1}`)
    angles.push(value)
  })

  return {
    product_name: base.product_name,
    product_summary: base.product_summary,
    core_features: core,
    marketing_angles: angles,
  }
}

function buildProfileFromSelected(base: AiMarketingProfile, items: FeatureItem[]): AiMarketingProfile {
  const core: string[] = []
  const angles: string[] = []

  items.forEach((item) => {
    if (!item.selected) return
    const name = item.name.trim()
    const value = item.value.trim()
    if (!name && !value) return
    core.push(name || `核心功能 ${core.length + 1}`)
    angles.push(value)
  })

  return {
    product_name: base.product_name,
    product_summary: base.product_summary,
    core_features: core,
    marketing_angles: angles,
  }
}

function formatFeatureLine(feature: FeatureItem) {
  const parts = [feature.name, feature.value].filter(Boolean)
  return parts.join('：')
}

export default function AiStudioClient({ region: _region, language, route: _route }: { region: 'CN' | 'INTL'; language: AiLanguage; route: AiProviderRoute }) {
  const [profile, setProfile] = useState<AiMarketingProfile>(defaultMarketingProfile)
  const [features, setFeatures] = useState<FeatureItem[]>(buildFeaturesFromProfile(defaultMarketingProfile))
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)

  const [activeMode, setActiveMode] = useState<'image' | 'video'>('image')

  const [imgStyle, setImgStyle] = useState(imageStyles[0])
  const [imgSystemPrompt, setImgSystemPrompt] = useState(defaultImagePrompt)

  const [vidVoice, setVidVoice] = useState(videoVoices[0])
  const [vidSystemPrompt, setVidSystemPrompt] = useState(defaultVideoPrompt)

  const [posterPromptDraft, setPosterPromptDraft] = useState('')
  const [posterPromptLoading, setPosterPromptLoading] = useState(false)
  const [posterPromptDirty, setPosterPromptDirty] = useState(false)

  const [posterJob, setPosterJob] = useState<JobEnvelope | null>(null)
  const [videoJob, setVideoJob] = useState<JobEnvelope | null>(null)
  const [submitting, setSubmitting] = useState<null | 'poster' | 'video'>(null)

  const pollersRef = useRef<{ poster?: () => void; video?: () => void }>({})
  const promptInitRef = useRef(false)

  const selectedFeatures = useMemo(
    () => features.filter((feature) => feature.selected && (feature.name.trim() || feature.value.trim())),
    [features],
  )

  const selectedFeatureLines = useMemo(
    () => selectedFeatures.map(formatFeatureLine).filter(Boolean),
    [selectedFeatures],
  )

  const hasSelectedFeatures = selectedFeatureLines.length > 0
  const allSelected = features.length > 0 && features.every((feature) => feature.selected)

  const posterAsset = posterJob?.assets.find((asset) => asset.asset_type === 'image') || null
  const videoAsset = videoJob?.assets.find((asset) => asset.asset_type === 'video') || null

  useEffect(() => () => {
    Object.values(pollersRef.current).forEach((stop) => stop?.())
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      setLoadingProfile(true)
      try {
        const json = await requestJson('/api/admin/ai/marketing-profile')
        if (cancelled) return
        const nextProfile = json.profile as AiMarketingProfile
        setProfile(nextProfile)
        setFeatures(buildFeaturesFromProfile(nextProfile))
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || '加载宣传配置失败，已使用默认配置')
          setProfile(defaultMarketingProfile)
          setFeatures(buildFeaturesFromProfile(defaultMarketingProfile))
        }
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    }

    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!promptInitRef.current) {
      promptInitRef.current = true
      return
    }
    setPosterPromptDirty(true)
  }, [features, imgSystemPrompt, imgStyle])

  function handleSelectAll() {
    if (features.length === 0) return
    const next = !allSelected
    setFeatures((current) => current.map((feature) => ({ ...feature, selected: next })))
  }

  function handleAddFeature() {
    setFeatures((current) => [
      ...current,
      { id: createId(), name: '', value: '', selected: true },
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

  async function saveProfile(nextProfile?: AiMarketingProfile) {
    setSavingProfile(true)
    try {
      const payload = nextProfile || buildProfileFromFeatures(profile, features)
      const json = await requestJson('/api/admin/ai/marketing-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      setProfile(json.profile as AiMarketingProfile)
      toast.success('宣传配置已保存')
    } catch (error: any) {
      toast.error(error?.message || '保存失败')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleRestoreDefault() {
    const nextProfile = { ...defaultMarketingProfile }
    setProfile(nextProfile)
    setFeatures(buildFeaturesFromProfile(nextProfile))
    await saveProfile(nextProfile)
  }

  function startPolling(kind: 'poster' | 'video', jobId: string) {
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

  async function handleGeneratePosterPrompt() {
    if (!hasSelectedFeatures) {
      toast.error('请先选择宣传功能')
      return
    }

    setPosterPromptLoading(true)
    try {
      const featureContext = selectedFeatureLines.map((line) => `- ${line}`).join('\n')
      const extraPrompt = [imgSystemPrompt, '业务要点:', featureContext].filter(Boolean).join('\n\n')
      const marketingProfile = buildProfileFromSelected(profile, features)

      const payload = {
        poster_goal: '产品宣发海报',
        audience: '企业客户、合作伙伴、评审',
        style: imgStyle,
        aspect_ratio: '4:5',
        title: profile.product_name || '产品',
        subtitle: profile.product_summary || '',
        cta: '立即体验',
        extra_prompt: extraPrompt,
        negative_prompt: '',
        brief: buildBriefPayload(extraPrompt),
        marketing_profile: marketingProfile,
      }

      const json = await requestJson('/api/admin/ai/poster-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const nextPrompt = json.prompt_bundle?.prompt || ''
      setPosterPromptDraft(nextPrompt)
      setPosterPromptDirty(false)
      if (!nextPrompt) {
        toast.error('提示词生成失败')
      } else {
        toast.success('提示词已生成，可编辑')
      }
    } catch (error: any) {
      toast.error(error?.message || '提示词生成失败')
    } finally {
      setPosterPromptLoading(false)
    }
  }

  function buildBriefPayload(extraNotes: string) {
    const sellingPoints = selectedFeatureLines
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

    if (!posterPromptDraft.trim()) {
      toast.error('请先生成并确认提示词')
      return
    }

    const featureContext = selectedFeatureLines.map((line) => `- ${line}`).join('\n')
    const extraPrompt = [imgSystemPrompt, '业务要点:', featureContext].filter(Boolean).join('\n\n')
    const marketingProfile = buildProfileFromSelected(profile, features)

    const payload = {
      poster_goal: '产品宣发海报',
      audience: '企业客户、合作伙伴、评审',
      style: imgStyle,
      aspect_ratio: '4:5',
      title: profile.product_name || '产品',
      subtitle: profile.product_summary || '',
      cta: '立即体验',
      extra_prompt: extraPrompt,
      negative_prompt: '',
      brief: buildBriefPayload(extraPrompt),
      marketing_profile: marketingProfile,
      prompt_override: posterPromptDraft,
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

    const featureContext = selectedFeatureLines.map((line) => `- ${line}`).join('\n')
    const extraPrompt = [
      vidSystemPrompt,
      `配音音色: ${vidVoice}`,
      '业务要点:',
      featureContext,
    ]
      .filter(Boolean)
      .join('\n\n')

    const marketingProfile = buildProfileFromSelected(profile, features)

    const payload = {
      aspect_ratio: '9:16',
      duration_seconds: 10,
      headline: profile.product_name || '产品解说',
      script_override: '',
      extra_prompt: extraPrompt,
      brief: buildBriefPayload(extraPrompt),
      marketing_profile: marketingProfile,
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
  const executedPosterPrompt = posterPrompt || posterPromptDraft

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-6 flex flex-col">
      <div className="max-w-[1400px] mx-auto w-full flex-1 flex flex-col gap-5">
        <header className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 flex items-center gap-3">
              <LayoutGrid className="w-7 h-7 text-cyan-600" />
              AI 创意中心
            </h1>
            <p className="mt-1 text-sm text-slate-500">基于人工维护的宣传配置生成海报与视频。</p>
          </div>
          <div className="text-sm font-medium text-cyan-700 bg-cyan-50 px-4 py-1.5 rounded-full border border-cyan-100">
            当前产品: {profile.product_name}
          </div>
        </header>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-3 justify-between items-center">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-800">
                <Settings className="w-5 h-5 text-slate-500" />
                宣传核心功能配置
              </h2>
              <p className="text-xs text-slate-500 mt-1">维护核心功能与卖点，生成海报和视频时将优先使用这里的内容。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-900 transition-colors bg-cyan-50 px-3 py-1.5 rounded-md"
                disabled={features.length === 0}
              >
                {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {allSelected ? '取消全选' : '全选所有'}
              </button>
              <button
                onClick={() => saveProfile()}
                disabled={savingProfile}
                className="flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                保存配置
              </button>
              <button
                onClick={handleRestoreDefault}
                disabled={savingProfile}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded-md hover:text-slate-800 hover:border-slate-300 transition-colors"
              >
                恢复默认
              </button>
            </div>
          </div>

          <div className="px-4 pt-3 pb-2 text-xs text-slate-500 flex flex-wrap gap-3 items-center">
            {loadingProfile ? <span>正在加载配置...</span> : <span>当前功能数量: {features.length}</span>}
          </div>

          <div className="max-h-[240px] overflow-y-auto p-2">
            <div className="flex flex-col gap-1.5">
              {features.length === 0 && (
                <div className="p-4 text-sm text-slate-500">暂无功能列表，请添加宣传功能。</div>
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
                <Plus className="w-4 h-4" /> 添加宣传功能
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
                <div className="grid md:grid-cols-12 gap-4">
                  <div className="md:col-span-5 space-y-4">
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

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                        <Terminal className="w-3 h-3" /> 海报基础提示词
                      </label>
                      <textarea
                        value={imgSystemPrompt}
                        onChange={(event) => setImgSystemPrompt(event.target.value)}
                        rows={4}
                        className="w-full p-2 text-xs border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                        <AlignLeft className="w-3 h-3 text-cyan-500" /> 已选宣传要点
                      </div>
                      {selectedFeatureLines.length === 0 ? (
                        <p className="text-xs text-slate-500">请先勾选宣传功能。</p>
                      ) : (
                        <ul className="text-xs text-slate-600 space-y-1">
                          {selectedFeatureLines.map((line, index) => (
                            <li key={`${line}-${index}`}>{line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-7 space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <Terminal className="w-3 h-3 text-cyan-500" /> 海报提示词预览
                        </div>
                        <div className="flex items-center gap-2">
                          {posterPromptDirty && (
                            <span className="text-[11px] text-amber-600">配置已变更，建议重新生成</span>
                          )}
                          <button
                            onClick={handleGeneratePosterPrompt}
                            disabled={posterPromptLoading || !hasSelectedFeatures}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 border border-cyan-200 px-2.5 py-1 rounded-md hover:bg-cyan-50 disabled:opacity-50"
                          >
                            {posterPromptLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Terminal className="w-3 h-3" />}
                            生成提示词
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={posterPromptDraft}
                        onChange={(event) => {
                          setPosterPromptDraft(event.target.value)
                          setPosterPromptDirty(false)
                        }}
                        rows={8}
                        placeholder="点击“生成提示词”后可在这里审核与修改"
                        className="w-full p-2 text-xs border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                      <div className="text-[11px] text-slate-500">提示词将作为生成海报时的最终执行内容。</div>
                    </div>

                    <button
                      onClick={handleGeneratePoster}
                      disabled={submitting === 'poster' || !hasSelectedFeatures || !posterPromptDraft.trim()}
                      className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2.5 rounded-lg flex justify-center items-center gap-2 transition-all disabled:opacity-50"
                    >
                      {submitting === 'poster' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                      生成海报
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-5 flex-1 min-h-[360px]">
                {!posterJob && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <ImageIcon className="w-12 h-12 mb-2" />
                    <p className="text-sm">提示词确认后生成海报</p>
                  </div>
                )}

                {posterJob && posterJob.job.status !== 'completed' && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    {['failed', 'blocked'].includes(posterJob.job.status) ? (
                      <X className="w-10 h-10 text-rose-500 mb-2" />
                    ) : (
                      <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mb-3" />
                    )}
                    <div className="text-xs font-semibold text-slate-500 mb-1">{posterJob.job.progress || 0}%</div>
                    <p className="text-xs">
                      {posterJob.job.status === 'failed' || posterJob.job.status === 'blocked' ? '海报生成失败' : '正在生成海报...'}
                    </p>
                    {posterJob.job.error_message && (
                      <p className="mt-2 text-xs text-rose-500">{posterJob.job.error_message}</p>
                    )}
                  </div>
                )}

                {posterJob && posterJob.job.status === 'completed' && (
                  <div className="space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between gap-2 text-cyan-700 text-xs font-semibold bg-cyan-50 p-2 rounded border border-cyan-100">
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

                    {posterAsset && (
                      <div className="rounded-xl overflow-hidden border border-slate-200">
                        <img src={posterAsset.public_url} alt="poster" className="w-full object-cover" />
                      </div>
                    )}

                    {!posterAsset && (
                      <div className="text-xs text-slate-500">未找到海报资源。</div>
                    )}
                  </div>
                )}

                {posterJob && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-cyan-500" /> 本次执行提示词（中文）
                    </div>
                    <textarea
                      value={executedPosterPrompt}
                      readOnly
                      rows={6}
                      placeholder="生成后显示"
                      className="w-full p-2 text-xs border border-slate-200 rounded-md bg-slate-50"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMode === 'video' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white flex justify-between items-center">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-amber-900">
                  <Video className="w-5 h-5 text-amber-500" /> 解说视频生成
                </h2>
              </div>

              <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-4">
                <div className="grid md:grid-cols-12 gap-4">
                  <div className="md:col-span-5 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                        <Mic className="w-3 h-3" /> 配音音色
                      </label>
                      <select
                        value={vidVoice}
                        onChange={(event) => setVidVoice(event.target.value)}
                        className="w-full p-2 text-sm border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                      >
                        {videoVoices.map((voice) => (
                          <option key={voice} value={voice}>
                            {voice}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                        <Terminal className="w-3 h-3" /> 视频基础提示词
                      </label>
                      <textarea
                        value={vidSystemPrompt}
                        onChange={(event) => setVidSystemPrompt(event.target.value)}
                        rows={4}
                        className="w-full p-2 text-xs border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-7 space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                        <AlignLeft className="w-3 h-3 text-amber-500" /> 已选宣传要点
                      </div>
                      {selectedFeatureLines.length === 0 ? (
                        <p className="text-xs text-slate-500">请先勾选宣传功能。</p>
                      ) : (
                        <ul className="text-xs text-slate-600 space-y-1">
                          {selectedFeatureLines.map((line, index) => (
                            <li key={`${line}-${index}`}>{line}</li>
                          ))}
                        </ul>
                      )}
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
                </div>
              </div>

              <div className="p-5 flex-1 min-h-[350px] bg-slate-900">
                {!videoJob && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <Video className="w-12 h-12 mb-2" />
                    <p className="text-sm">准备好要点后生成视频分镜</p>
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

                    {videoAsset && (
                      <video src={videoAsset.public_url} controls className="w-full rounded-xl border border-slate-800" />
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

