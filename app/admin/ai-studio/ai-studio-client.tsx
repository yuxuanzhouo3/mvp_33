'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BrainCircuit, Clapperboard, Download, Image as ImageIcon, Loader2, RefreshCcw, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { AiAsset, AiLanguage, AiProjectAnalysis } from '@/lib/admin/types'
import type { AiProviderRoute } from '@/lib/admin/ai/provider-router'

type JobEnvelope = {
  job: any
  assets: AiAsset[]
  analysis: AiProjectAnalysis | null
  brief: any
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : '--'
}

function statusClass(status: string) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'failed') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (status === 'in_progress') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const json = await response.json()
  if (!json.success) {
    throw new Error(json.error || 'Request failed')
  }
  return json
}

export default function AiStudioClient({ region, language, route }: { region: 'CN' | 'INTL'; language: AiLanguage; route: AiProviderRoute }) {
  const isChinese = region === 'CN'
  const tr = (cn: string, en: string) => (isChinese ? cn : en)
  const [tab, setTab] = useState('project')
  const [jobs, setJobs] = useState<JobEnvelope[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<JobEnvelope | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [brief, setBrief] = useState({
    audience: isChinese ? '企业客户、团队管理员、业务负责人' : 'team admins, enterprise buyers, and product leads',
    coreSellingPoints: '',
    brandTone: isChinese ? '专业、可信、未来感' : 'confident, modern, trustworthy',
    mustInclude: '',
    mustAvoid: '',
    cta: isChinese ? '立即体验' : 'Try it now',
    extraNotes: '',
  })
  const [poster, setPoster] = useState({
    poster_goal: isChinese ? '参评宣传海报' : 'award submission poster',
    audience: isChinese ? '企业客户、评审、合作伙伴' : 'judges, buyers, and partners',
    style: isChinese ? '未来工作台 / 科技海报' : 'future control room / tech poster',
    aspect_ratio: '4:5',
    title: '',
    subtitle: '',
    cta: isChinese ? '立即体验' : 'Try it now',
    extra_prompt: '',
    negative_prompt: '',
  })
  const [video, setVideo] = useState({
    headline: '',
    aspect_ratio: region === 'CN' ? '9:16' : '16:9',
    duration_seconds: 20,
    script_override: '',
    extra_prompt: '',
    cover_asset_id: '',
  })

  const latestAnalysis = useMemo(() => selectedJob?.analysis || jobs.find((item) => item.analysis)?.analysis || null, [jobs, selectedJob])
  const posterAsset = selectedJob?.assets.find((asset) => asset.asset_type === 'image') || null
  const coverAsset = selectedJob?.assets.find((asset) => asset.asset_type === 'cover') || null
  const videoAsset = selectedJob?.assets.find((asset) => asset.asset_type === 'video') || null

  async function loadJobs(preserveSelection = true) {
    const json = await requestJson('/api/admin/ai/jobs')
    const nextJobs = json.jobs as JobEnvelope[]
    setJobs(nextJobs)
    if (preserveSelection && selectedJobId) {
      const match = nextJobs.find((item) => item.job.id === selectedJobId)
      if (match) {
        setSelectedJob(match)
        return
      }
    }
    if (nextJobs[0]) {
      setSelectedJobId(nextJobs[0].job.id)
      setSelectedJob(nextJobs[0])
    }
  }

  async function loadJobDetail(jobId: string) {
    const json = await requestJson(`/api/admin/ai/jobs/${jobId}`)
    const envelope = { job: json.job, assets: json.assets, analysis: json.analysis, brief: json.brief }
    setSelectedJob(envelope)
    setJobs((current) => {
      const exists = current.some((item) => item.job.id === jobId)
      if (!exists) return [envelope, ...current]
      return current.map((item) => (item.job.id === jobId ? envelope : item))
    })
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadJobs(false)
      } catch (error: any) {
        toast.error(error.message || tr('加载任务失败', 'Failed to load jobs'))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!selectedJobId || !selectedJob || !['queued', 'in_progress'].includes(selectedJob.job.status)) return
    const timer = window.setTimeout(() => {
      void loadJobDetail(selectedJobId).catch((error: any) => toast.error(error.message || tr('轮询失败', 'Polling failed')))
    }, 3500)
    return () => window.clearTimeout(timer)
  }, [selectedJobId, selectedJob?.job?.status, selectedJob?.job?.progress])

  useEffect(() => {
    if (!latestAnalysis) return
    setPoster((current) => ({
      ...current,
      title: current.title || latestAnalysis.analysis_payload.product_name,
      subtitle: current.subtitle || latestAnalysis.analysis_payload.product_summary,
    }))
    setVideo((current) => ({ ...current, headline: current.headline || latestAnalysis.analysis_payload.product_name }))
    setBrief((current) => ({ ...current, coreSellingPoints: current.coreSellingPoints || latestAnalysis.analysis_payload.marketing_angles.join('\n') }))
  }, [latestAnalysis])

  async function createJob(url: string, payload: any, mode: string) {
    setSubmitting(mode)
    try {
      const json = await requestJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSelectedJobId(json.jobId)
      toast.success(tr('任务已创建', 'Job created'))
      await loadJobs(false)
      await loadJobDetail(json.jobId)
    } catch (error: any) {
      toast.error(error.message || tr('创建任务失败', 'Failed to create job'))
    } finally {
      setSubmitting(null)
    }
  }

  function buildBriefPayload(extra: string) {
    return {
      audience: brief.audience,
      core_selling_points: splitLines(brief.coreSellingPoints),
      brand_tone: brief.brandTone,
      must_include: splitLines(brief.mustInclude),
      must_avoid: splitLines(brief.mustAvoid),
      cta: brief.cta,
      extra_notes: [brief.extraNotes, extra].filter(Boolean).join('\n'),
    }
  }

  async function regeneratePoster() {
    if (!posterAsset) {
      toast.error(tr('没有海报结果可重绘', 'No poster result to regenerate'))
      return
    }
    setSubmitting('poster-regenerate')
    try {
      const json = await requestJson(`/api/admin/ai/assets/${posterAsset.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplemental_prompt: poster.extra_prompt || brief.extraNotes || poster.title }),
      })
      setSelectedJobId(json.jobId)
      await loadJobs(false)
      await loadJobDetail(json.jobId)
      toast.success(tr('已创建重绘任务', 'Regeneration queued'))
    } catch (error: any) {
      toast.error(error.message || tr('重绘失败', 'Regeneration failed'))
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_35%),linear-gradient(135deg,#f8fafc,_#eef2ff_45%,_#fff7ed)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500"><Sparkles className="h-4 w-4" />{tr('后台创意工作台', 'Admin Creative Workbench')}</div>
            <h1 className="text-3xl font-semibold text-slate-900">{tr('AI 创意中心', 'AI Creative Studio')}</h1>
            <p className="mt-1 text-sm text-slate-600">{tr('一套后台代码，同时支持国内中文物料和国际英文物料。', 'One admin surface for CN Chinese assets and INTL English assets.')}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Badge variant="outline" className="rounded-full bg-white/70 px-4 py-2">{tr('区域', 'Region')}: {region}</Badge>
            <Badge variant="outline" className="rounded-full bg-white/70 px-4 py-2">{tr('语言', 'Language')}: {language}</Badge>
            <Badge variant="outline" className="rounded-full bg-white/70 px-4 py-2">{tr('分析/海报', 'Analysis/Poster')}: {route.analysisProvider} / {route.posterProvider}</Badge>
            <Badge variant="outline" className="rounded-full bg-white/70 px-4 py-2">{tr('视频', 'Video')}: {route.videoProvider}</Badge>
          </div>
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="project">{tr('项目理解', 'Project Insight')}</TabsTrigger>
          <TabsTrigger value="poster">{tr('宣传图生成', 'Poster')}</TabsTrigger>
          <TabsTrigger value="video">{tr('解说视频', 'Video')}</TabsTrigger>
          <TabsTrigger value="history">{tr('任务记录', 'History')}</TabsTrigger>
        </TabsList>

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-sky-600" />{tr('项目理解底稿', 'Project Analysis Base')}</CardTitle>
                <CardDescription>{tr('整仓扫描生成产品理解，并缓存后续海报和视频的底稿。', 'Scan the repo once and reuse it as the basis for posters and videos.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full rounded-2xl" onClick={() => createJob('/api/admin/ai/repo-analysis', { language, repo_scope: ['app', 'lib', 'actions', 'components', 'config', 'hooks', 'types', 'scripts'] }, 'analysis')} disabled={submitting === 'analysis'}>
                  {submitting === 'analysis' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                  {tr('一键分析仓库', 'Analyze Repository')}
                </Button>
                {latestAnalysis ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-900">{latestAnalysis.analysis_payload.product_name}</p>
                    <p className="mt-2">{latestAnalysis.analysis_payload.product_summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {latestAnalysis.analysis_payload.marketing_angles.map((item, index) => (
                        <Badge key={`${index}-${String(item)}`} variant="secondary">{String(item)}</Badge>
                      ))}
                    </div>
                  </div>
                ) : <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{tr('还没有分析结果。', 'No analysis yet.')}</div>}
              </CardContent>
            </Card>

            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle>{tr('营销简报', 'Creative Brief')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2"><Label>{tr('受众', 'Audience')}</Label><Input value={brief.audience} onChange={(e) => setBrief((current) => ({ ...current, audience: e.target.value }))} /></div>
                <div className="space-y-2"><Label>{tr('核心卖点', 'Core Selling Points')}</Label><Textarea rows={4} value={brief.coreSellingPoints} onChange={(e) => setBrief((current) => ({ ...current, coreSellingPoints: e.target.value }))} /></div>
                <div className="space-y-2"><Label>{tr('品牌语气', 'Brand Tone')}</Label><Input value={brief.brandTone} onChange={(e) => setBrief((current) => ({ ...current, brandTone: e.target.value }))} /></div>
                <div className="space-y-2"><Label>{tr('必须包含', 'Must Include')}</Label><Textarea rows={3} value={brief.mustInclude} onChange={(e) => setBrief((current) => ({ ...current, mustInclude: e.target.value }))} /></div>
                <div className="space-y-2"><Label>{tr('必须避免', 'Must Avoid')}</Label><Textarea rows={3} value={brief.mustAvoid} onChange={(e) => setBrief((current) => ({ ...current, mustAvoid: e.target.value }))} /></div>
                <div className="space-y-2"><Label>CTA</Label><Input value={brief.cta} onChange={(e) => setBrief((current) => ({ ...current, cta: e.target.value }))} /></div>
                <div className="space-y-2"><Label>{tr('补充说明', 'Extra Notes')}</Label><Textarea rows={3} value={brief.extraNotes} onChange={(e) => setBrief((current) => ({ ...current, extraNotes: e.target.value }))} /></div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <TabsContent value="project" className="m-0">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>{tr('项目结构与卖点', 'Architecture and Angles')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {latestAnalysis ? (
                    <>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{tr('技术栈', 'Tech Stack')}</p>
                          {latestAnalysis.analysis_payload.technical_stack.map((item, index) => (
                            <p key={`${index}-${String(item)}`} className="text-sm text-slate-700">
                              • {String(item)}
                            </p>
                          ))}
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{tr('区域差异', 'Region Differences')}</p>
                          {latestAnalysis.analysis_payload.region_differences.map((item, index) => (
                            <p key={`${index}-${String(item)}`} className="text-sm text-slate-700">
                              • {String(item)}
                            </p>
                          ))}
                        </div>
                      </div>
                      <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{latestAnalysis.summary_text}</pre>
                    </>
                  ) : <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">{tr('先执行分析任务。', 'Run an analysis job first.')}</div>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="poster" className="m-0">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-amber-600" />{tr('海报生成控制台', 'Poster Console')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2"><Label>{tr('海报目标', 'Poster Goal')}</Label><Input value={poster.poster_goal} onChange={(e) => setPoster((current) => ({ ...current, poster_goal: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>{tr('受众', 'Audience')}</Label><Input value={poster.audience} onChange={(e) => setPoster((current) => ({ ...current, audience: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>{tr('风格', 'Style')}</Label><Input value={poster.style} onChange={(e) => setPoster((current) => ({ ...current, style: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>{tr('比例', 'Aspect Ratio')}</Label><Input value={poster.aspect_ratio} onChange={(e) => setPoster((current) => ({ ...current, aspect_ratio: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-2"><Label>{tr('标题', 'Title')}</Label><Input value={poster.title} onChange={(e) => setPoster((current) => ({ ...current, title: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>{tr('副标题', 'Subtitle')}</Label><Input value={poster.subtitle} onChange={(e) => setPoster((current) => ({ ...current, subtitle: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>CTA</Label><Input value={poster.cta} onChange={(e) => setPoster((current) => ({ ...current, cta: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>{tr('额外提示词', 'Extra Prompt')}</Label><Textarea rows={4} value={poster.extra_prompt} onChange={(e) => setPoster((current) => ({ ...current, extra_prompt: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>{tr('反向提示词', 'Negative Prompt')}</Label><Textarea rows={3} value={poster.negative_prompt} onChange={(e) => setPoster((current) => ({ ...current, negative_prompt: e.target.value }))} /></div>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => createJob('/api/admin/ai/posters', { ...poster, analysis_id: latestAnalysis?.id, brief: buildBriefPayload(poster.extra_prompt) }, 'poster')} disabled={submitting === 'poster'}>
                      {submitting === 'poster' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                      {tr('生成海报', 'Generate Poster')}
                    </Button>
                    <Button variant="outline" onClick={regeneratePoster} disabled={submitting === 'poster-regenerate'}>
                      {submitting === 'poster-regenerate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                      {tr('基于当前结果重绘', 'Regenerate Current')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="video" className="m-0">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Clapperboard className="h-5 w-5 text-rose-600" />{tr('视频生成控制台', 'Video Console')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 lg:grid-cols-3">
                    <div className="space-y-2 lg:col-span-2"><Label>{tr('视频标题', 'Headline')}</Label><Input value={video.headline} onChange={(e) => setVideo((current) => ({ ...current, headline: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>{tr('时长（秒）', 'Duration')}</Label><Input type="number" value={video.duration_seconds} onChange={(e) => setVideo((current) => ({ ...current, duration_seconds: Number(e.target.value) || 20 }))} /></div>
                    <div className="space-y-2"><Label>{tr('画幅', 'Aspect Ratio')}</Label><Input value={video.aspect_ratio} onChange={(e) => setVideo((current) => ({ ...current, aspect_ratio: e.target.value }))} /></div>
                    <div className="space-y-2 lg:col-span-2"><Label>{tr('封面资源', 'Cover Asset')}</Label><Input value={video.cover_asset_id} readOnly placeholder={tr('在右侧结果区设置', 'Set from the result panel')} /></div>
                  </div>
                  <div className="space-y-2"><Label>{tr('脚本覆盖', 'Script Override')}</Label><Textarea rows={8} value={video.script_override} onChange={(e) => setVideo((current) => ({ ...current, script_override: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>{tr('补充提示词', 'Extra Prompt')}</Label><Textarea rows={3} value={video.extra_prompt} onChange={(e) => setVideo((current) => ({ ...current, extra_prompt: e.target.value }))} /></div>
                  <Button onClick={() => createJob('/api/admin/ai/videos', { ...video, analysis_id: latestAnalysis?.id, brief: buildBriefPayload(video.extra_prompt) }, 'video')} disabled={submitting === 'video'}>
                    {submitting === 'video' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
                    {tr('生成视频', 'Generate Video')}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="m-0">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>{tr('任务记录', 'Task History')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tr('类型', 'Type')}</TableHead>
                          <TableHead>{tr('状态', 'Status')}</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>{tr('更新时间', 'Updated')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((entry) => (
                          <TableRow key={entry.job.id} className="cursor-pointer" onClick={() => { setSelectedJobId(entry.job.id); setSelectedJob(entry) }}>
                            <TableCell>{entry.job.job_type}</TableCell>
                            <TableCell><Badge variant="outline" className={statusClass(entry.job.status)}>{entry.job.status}</Badge></TableCell>
                            <TableCell>{entry.job.provider}</TableCell>
                            <TableCell>{formatDate(entry.job.updated_at)}</TableCell>
                          </TableRow>
                        ))}
                        {!jobs.length && <TableRow><TableCell colSpan={4} className="text-center text-slate-500">{tr('暂无任务', 'No jobs yet')}</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          <div className="space-y-4">
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle>{tr('结果预览', 'Result Preview')}</CardTitle>
                <CardDescription>{tr('轮询当前任务并展示海报、封面、视频与脚本。', 'Poll the selected job and show poster, cover, video, and script outputs.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{tr('加载中...', 'Loading...')}</div>
                ) : selectedJob ? (
                  <>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">{tr('当前任务', 'Current Job')}</p>
                          <p className="font-medium text-slate-900">{selectedJob.job.job_type}</p>
                        </div>
                        <Badge variant="outline" className={statusClass(selectedJob.job.status)}>{selectedJob.job.status}</Badge>
                      </div>
                      <div className="mt-3 text-sm text-slate-600">{selectedJob.job.provider} · {selectedJob.job.provider_model}</div>
                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>{tr('进度', 'Progress')}</span><span>{selectedJob.job.progress || 0}%</span></div>
                        <Progress value={selectedJob.job.progress || 0} />
                      </div>
                      {selectedJob.job.error_message && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{selectedJob.job.error_message}</p>}
                    </div>

                    {posterAsset && (
                      <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-900">{tr('海报结果', 'Poster Result')}</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => window.open(posterAsset.public_url, '_blank', 'noopener,noreferrer')}><Download className="mr-2 h-4 w-4" />{tr('下载', 'Download')}</Button>
                            <Button size="sm" variant="outline" onClick={() => { setVideo((current) => ({ ...current, cover_asset_id: posterAsset.id })); toast.success(tr('已设为视频封面', 'Set as video cover')) }}>{tr('设为视频封面', 'Use as Cover')}</Button>
                          </div>
                        </div>
                        <img src={posterAsset.public_url} alt="poster" className="w-full rounded-2xl border border-slate-200 object-cover" />
                      </div>
                    )}

                    {coverAsset && <img src={coverAsset.public_url} alt="cover" className="w-full rounded-2xl border border-slate-200 object-cover" />}
                    {videoAsset && <video src={videoAsset.public_url} controls className="w-full rounded-2xl border border-slate-200" />}
                    {selectedJob.analysis && <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100 whitespace-pre-wrap">{selectedJob.analysis.summary_text}</pre>}
                    {(selectedJob.job.output_payload?.prompt_bundle || selectedJob.job.output_payload?.video_plan) && <pre className="max-h-80 overflow-auto rounded-2xl bg-slate-50 p-4 text-xs text-slate-700">{JSON.stringify(selectedJob.job.output_payload?.prompt_bundle || selectedJob.job.output_payload?.video_plan, null, 2)}</pre>}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">{tr('选择任务查看详情', 'Select a job to inspect')}</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  )
}