"use client";

import { useEffect, useMemo, useState } from "react";
import {
  analyzeAndSaveFeedback,
  createIteration,
  getAnalysisDashboard,
  getFeedbacks,
  getIterations,
  refreshAnalysisClusters,
  updateFeedbackStatus,
  updateIterationStatus,
} from "@/actions/admin-analysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AnalysisDashboardSummary, ProductIteration, UserFeedback } from "@/lib/admin/types";
import { CheckCircle2, GitBranchPlus, Loader2, RefreshCcw, Sparkles, TrendingDown, Users } from "lucide-react";
import { toast } from "sonner";

const feedbackMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "待处理", className: "border-amber-200 bg-amber-50 text-amber-700" },
  processing: { label: "处理中", className: "border-blue-200 bg-blue-50 text-blue-700" },
  analyzed: { label: "已分析", className: "border-violet-200 bg-violet-50 text-violet-700" },
  resolved: { label: "已解决", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  ignored: { label: "已忽略", className: "border-slate-200 bg-slate-100 text-slate-600" },
};

const iterationMeta: Record<string, { label: string; className: string }> = {
  planned: { label: "规划中", className: "border-slate-200 bg-slate-100 text-slate-700" },
  in_progress: { label: "开发中", className: "border-blue-200 bg-blue-50 text-blue-700" },
  completed: { label: "已发布", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

function parseAnalysis(input: unknown) {
  if (!input) return { summary: "", painPoints: [] as string[], suggestions: [] as string[] };
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { return { summary: input, painPoints: [], suggestions: [] }; }
  }
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    painPoints: Array.isArray(data.pain_points) ? data.pain_points.filter((x): x is string => typeof x === "string") : [],
    suggestions: Array.isArray(data.suggestions) ? data.suggestions.filter((x): x is string => typeof x === "string") : [],
  };
}

function fmt(value?: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : "-";
}

function pct(value?: number) {
  return `${Math.round(Number(value || 0))}%`;
}

function nextVersion(items: ProductIteration[]) {
  const nums = items.map((item) => Number(String(item.version).replace(/[^\d]/g, ""))).filter((item) => Number.isFinite(item) && item > 0);
  return `V${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
}

export default function AnalysisPage() {
  const [dashboard, setDashboard] = useState<AnalysisDashboardSummary | null>(null);
  const [feedbacks, setFeedbacks] = useState<UserFeedback[]>([]);
  const [iterations, setIterations] = useState<ProductIteration[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [filter, setFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshingClusters, setRefreshingClusters] = useState(false);
  const [updatingIterationId, setUpdatingIterationId] = useState<string | null>(null);
  const [form, setForm] = useState({ version: "", title: "", content: "", status: "planned" as ProductIteration["status"], releaseDate: "" });

  async function loadData() {
    setLoading(true);
    try {
      const [summary, feedbackRows, iterationRows] = await Promise.all([
        getAnalysisDashboard({ rangeDays: 30, featureLimit: 8, clusterLimit: 8, churnWindowDays: 7 }),
        getFeedbacks(),
        getIterations(),
      ]);
      setDashboard(summary);
      setFeedbacks(feedbackRows || []);
      setIterations(iterationRows || []);
      setSelectedIds((current) => current.filter((id) => feedbackRows.some((item) => item.id === id)));
      setForm((current) => ({ ...current, version: current.version || nextVersion(iterationRows) }));
    } catch {
      toast.error("加载用户分析数据失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  async function handleAnalyze(id: string) {
    setAnalyzingId(id);
    try { await analyzeAndSaveFeedback(id); toast.success("AI 分析完成"); await loadData(); }
    catch { toast.error("AI 分析失败"); }
    finally { setAnalyzingId(null); }
  }

  async function handleRefreshClusters() {
    setRefreshingClusters(true);
    try {
      const result = await refreshAnalysisClusters({ rangeDays: 30, clusterLimit: 8 });
      setDashboard((current) => (current ? { ...current, clusters: result.clusters } : current));
      toast.success("反馈聚类已刷新");
    } catch {
      toast.error("反馈聚类刷新失败");
    } finally {
      setRefreshingClusters(false);
    }
  }

  async function handleCreateIteration() {
    if (!form.title.trim() || !form.content.trim()) return toast.error("请先填写迭代标题和内容");
    setCreating(true);
    try {
      await createIteration({ version: form.version || nextVersion(iterations), title: form.title.trim(), content: form.content.trim(), status: form.status, release_date: form.releaseDate || undefined, feedback_ids: selectedIds });
      if (selectedIds.length) await Promise.all(selectedIds.map((id) => updateFeedbackStatus(id, "processing")));
      toast.success("产品迭代已创建");
      setSelectedIds([]);
      setForm({ version: nextVersion(iterations), title: "", content: "", status: "planned", releaseDate: "" });
      await loadData();
    } catch {
      toast.error("创建迭代失败");
    } finally {
      setCreating(false);
    }
  }

  const filteredFeedbacks = useMemo(() => feedbacks.filter((item) => (filter === "all" || item.status === filter) && (!keyword.trim() || [item.content, item.email, item.user_id, item.feature_key, ...(item.pros || []), ...(item.cons || [])].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword.trim().toLowerCase())))), [feedbacks, filter, keyword]);
  const selectedFeedbacks = useMemo(() => feedbacks.filter((item) => selectedIds.includes(item.id)), [feedbacks, selectedIds]);

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-4xl">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">User Analysis Hub</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">用户行为分析与反馈聚合</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">已接入行为埋点、功能排行、流失功能检测、反馈聚类、版本闭环。用户侧可调用 `/api/analysis/events` 与 `/api/analysis/feedback` 上报数据，管理侧通过 `/api/admin/analysis/*` 读取结果。</p>
            <div className="mt-3 text-xs text-slate-500">分析窗口：{fmt(dashboard?.range_start)} 至 {fmt(dashboard?.range_end)} · 最近生成：{fmt(dashboard?.generated_at)}</div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}刷新</Button>
            <Button variant="outline" className="gap-2" onClick={() => void handleRefreshClusters()} disabled={refreshingClusters}>{refreshingClusters ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}重跑聚类</Button>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "活跃用户", value: dashboard?.active_users ?? 0, hint: "近 30 天有事件或登录", icon: Users },
            { title: "新增用户", value: dashboard?.new_users ?? 0, hint: "时间范围内创建", icon: Sparkles },
            { title: "事件总量", value: dashboard?.total_events ?? 0, hint: "click / hover / scroll / dwell", icon: CheckCircle2 },
            { title: "沉默用户", value: dashboard?.dormant_users ?? 0, hint: "连续 30 天未登录", icon: TrendingDown },
          ].map((card) => (
            <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">{card.title}</div><div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{card.value}</div></div>
                <div className="rounded-xl bg-slate-100 p-2 text-slate-700"><card.icon className="h-5 w-5" /></div>
              </div>
              <div className="mt-3 text-sm text-slate-600">{card.hint}</div>
            </div>
          ))}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap gap-2 rounded-2xl bg-slate-100 p-2">
          <TabsTrigger value="overview">分析总览</TabsTrigger>
          <TabsTrigger value="feedback">反馈池</TabsTrigger>
          <TabsTrigger value="iteration">迭代工作区</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card><CardHeader><CardTitle>注册 / 登录来源</CardTitle><CardDescription>按 `register/login` 事件中的来源字段聚合。</CardDescription></CardHeader><CardContent className="space-y-4">{[["注册来源", dashboard?.registration_sources || []], ["登录来源", dashboard?.login_sources || []]].map(([label, rows]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-sm font-medium text-slate-900">{label}</div><div className="mt-3 space-y-3">{Array.isArray(rows) && rows.length ? rows.map((row) => <div key={`${label}-${row.source}`}><div className="flex items-center justify-between text-sm"><span className="text-slate-700">{row.source}</span><span className="font-medium text-slate-950">{row.count} / {pct(row.share)}</span></div><div className="mt-2 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(8, row.share)}%` }} /></div></div>) : <div className="text-sm text-slate-500">当前没有来源事件。</div>}</div></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle>反馈摘要</CardTitle><CardDescription>按版本、优点、缺点聚合，直接支撑产品取舍。</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">反馈总量</div><div className="mt-2 text-2xl font-semibold text-slate-950">{dashboard?.feedback.total_feedback || 0}</div></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">已解决</div><div className="mt-2 text-2xl font-semibold text-slate-950">{dashboard?.feedback.resolved_feedback || 0}</div></div></div><div><div className="text-sm font-medium text-slate-900">高频缺点</div><div className="mt-2 flex flex-wrap gap-2">{(dashboard?.feedback.top_cons || []).length ? dashboard?.feedback.top_cons.map((item) => <Badge key={`con-${item.topic}`} variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{item.topic} · {item.count}</Badge>) : <span className="text-sm text-slate-500">暂无结构化缺点</span>}</div></div><div><div className="text-sm font-medium text-slate-900">高频优点</div><div className="mt-2 flex flex-wrap gap-2">{(dashboard?.feedback.top_pros || []).length ? dashboard?.feedback.top_pros.map((item) => <Badge key={`pro-${item.topic}`} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{item.topic} · {item.count}</Badge>) : <span className="text-sm text-slate-500">暂无结构化优点</span>}</div></div></CardContent></Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2"><CardHeader><CardTitle>功能使用排行</CardTitle><CardDescription>输出使用次数、覆盖率、停留时长。</CardDescription></CardHeader><CardContent className="space-y-4">{(dashboard?.top_features || []).length ? dashboard?.top_features.map((item) => <div key={item.feature_key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold text-slate-950">{item.feature_key}</div><div className="mt-1 text-xs text-slate-500">覆盖率 {pct(item.user_coverage_rate)} · 平均停留 {item.average_dwell_ms}ms · 最近使用 {fmt(item.last_used_at)}</div></div><Badge variant="outline">{item.usage_count} 次</Badge></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600"><Badge variant="outline">点击 {item.click_count}</Badge><Badge variant="outline">悬停 {item.hover_count}</Badge><Badge variant="outline">滚动 {item.scroll_count}</Badge>{item.page_paths.map((path) => <Badge key={`${item.feature_key}-${path}`} variant="outline">{path}</Badge>)}</div></div>) : <div className="text-sm text-slate-500">当前没有功能行为数据。</div>}</CardContent></Card>
            <Card><CardHeader><CardTitle>流失功能</CardTitle><CardDescription>使用功能后在窗口内未再次登录。</CardDescription></CardHeader><CardContent className="space-y-4">{(dashboard?.churn_features || []).length ? dashboard?.churn_features.map((item) => <div key={item.feature_key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-slate-900">{item.feature_key}</div><Badge className="border-rose-200 bg-rose-50 text-rose-700">{pct(item.churn_rate)}</Badge></div><div className="mt-2 text-xs text-slate-500">样本 {item.users} · 可评估 {item.eligible_users} · 流失 {item.churned_users}</div><div className="mt-3 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.max(8, item.churn_rate)}%` }} /></div></div>) : <div className="text-sm text-slate-500">暂无流失样本。</div>}</CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle>反馈聚类</CardTitle><CardDescription>简单词频与短语聚类，输出主题和改进建议。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(dashboard?.clusters || []).length ? dashboard?.clusters.map((cluster) => <div key={`${cluster.snapshot_key}-${cluster.topic}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div className="font-medium text-slate-900">{cluster.topic}</div><Badge variant="outline">{cluster.frequency} 次</Badge></div><div className="mt-2 flex flex-wrap gap-2">{cluster.keywords.map((keyword) => <Badge key={`${cluster.topic}-${keyword}`} variant="outline">{keyword}</Badge>)}</div><div className="mt-3 text-sm leading-6 text-slate-600">{cluster.suggestion}</div></div>) : <div className="text-sm text-slate-500">暂无聚类结果。</div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="feedback" className="mt-6">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card><CardHeader className="space-y-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle>反馈池</CardTitle><CardDescription>这里承接优点、缺点、截图和 AI 洞察，再进入版本迭代。</CardDescription></div><Input className="max-w-sm" placeholder="搜索内容 / 邮箱 / 功能标识" value={keyword} onChange={(event) => setKeyword(event.target.value)} /></div><div className="flex flex-wrap gap-2">{["all", "pending", "processing", "analyzed", "resolved", "ignored"].map((item) => <Button key={item} type="button" size="sm" variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)}>{item === "all" ? "全部" : feedbackMeta[item]?.label || item}</Button>)}</div></CardHeader><CardContent className="space-y-4">{loading ? <div className="flex h-40 items-center justify-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div> : filteredFeedbacks.length ? filteredFeedbacks.map((item) => { const parsed = parseAnalysis(item.analysis_result); const meta = feedbackMeta[item.status] || feedbackMeta.pending; return <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-4 xl:flex-row xl:justify-between"><div className="flex gap-3"><Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={(checked) => setSelectedIds((current) => checked === true ? Array.from(new Set([...current, item.id])) : current.filter((id) => id !== item.id))} className="mt-1" /><div><div className="flex flex-wrap items-center gap-2"><Badge className={meta.className}>{meta.label}</Badge><span className="text-xs text-slate-400">{fmt(item.created_at)}</span>{item.email ? <span className="text-xs text-slate-500">{item.email}</span> : null}{item.user_id ? <span className="text-xs text-slate-500">用户 ID: {item.user_id}</span> : null}{item.version ? <Badge variant="outline">{item.version}</Badge> : null}{item.feature_key ? <Badge variant="outline">{item.feature_key}</Badge> : null}</div><p className="mt-3 text-sm leading-7 text-slate-700">{item.content}</p><div className="mt-3 flex flex-wrap gap-2">{(item.pros || []).map((pro) => <Badge key={`${item.id}-${pro}`} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">优点: {pro}</Badge>)}{(item.cons || []).map((con) => <Badge key={`${item.id}-${con}`} variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">缺点: {con}</Badge>)}</div></div></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" className="gap-2" disabled={analyzingId === item.id} onClick={() => void handleAnalyze(item.id)}>{analyzingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 分析</Button><Button type="button" size="sm" variant="outline" onClick={() => void updateFeedbackStatus(item.id, "processing").then(() => loadData())}>处理中</Button><Button type="button" size="sm" onClick={() => void handleCreateIteration()} disabled>{selectedIds.includes(item.id) ? "已加入迭代候选" : "先勾选后建迭代"}</Button><Button type="button" size="sm" variant="outline" onClick={() => void updateFeedbackStatus(item.id, "resolved").then(() => loadData())}>已解决</Button></div></div>{parsed.summary || parsed.painPoints.length || parsed.suggestions.length ? <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-slate-700">{parsed.summary ? <div>{parsed.summary}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{parsed.painPoints.map((point) => <Badge key={`${item.id}-pain-${point}`} variant="outline" className="border-rose-200 bg-white text-rose-700">{point}</Badge>)}{parsed.suggestions.map((suggestion) => <Badge key={`${item.id}-sug-${suggestion}`} variant="outline" className="border-emerald-200 bg-white text-emerald-700">{suggestion}</Badge>)}</div></div> : null}</div>; }) : <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">当前筛选条件下没有反馈记录。</div>}</CardContent></Card>
            <Card><CardHeader><CardTitle>选中反馈</CardTitle><CardDescription>勾选本轮要解决的问题，直接带入迭代工作区。</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">已选 <span className="font-semibold text-slate-950">{selectedIds.length}</span> 条反馈</div>{selectedFeedbacks.length ? selectedFeedbacks.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 px-4 py-3"><div className="text-xs text-slate-400">{item.email || item.user_id || item.id}</div><div className="mt-1 line-clamp-3 text-sm leading-6 text-slate-700">{item.content}</div></div>) : <div className="text-sm text-slate-500">还没有选中的反馈。</div>}<div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-4 text-sm leading-7 text-sky-900">建议把“高频缺点 + 高频正向需求”一起纳入版本，避免只修 bug 不补核心价值。</div><Button type="button" className="gap-2" onClick={() => setTab("iteration")}><GitBranchPlus className="h-4 w-4" />去创建迭代</Button></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="iteration" className="mt-6">
          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <Card><CardHeader><CardTitle>迭代工作区</CardTitle><CardDescription>把用户问题转成版本目标、行动清单和发布时间。</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Input placeholder="版本号，例如 V08" value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} /><Input type="date" value={form.releaseDate} onChange={(event) => setForm((current) => ({ ...current, releaseDate: event.target.value }))} /></div><Input placeholder="迭代标题" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /><div className="flex flex-wrap gap-2">{(["planned", "in_progress", "completed"] as ProductIteration["status"][]).map((status) => <Button key={status} type="button" size="sm" variant={form.status === status ? "default" : "outline"} onClick={() => setForm((current) => ({ ...current, status }))}>{iterationMeta[status].label}</Button>)}</div><Textarea className="min-h-[180px]" placeholder="写清楚本轮要修掉哪些差体验，补上哪些高频需求，以及如何验证改善。" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} /><div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm leading-7 text-emerald-900">版本描述建议同时覆盖：高流失功能整改、高频正向能力补强、验证指标。</div><div className="flex flex-wrap gap-3"><Button type="button" className="gap-2" onClick={() => void handleCreateIteration()} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranchPlus className="h-4 w-4" />}创建产品迭代</Button><Button type="button" variant="outline" onClick={() => setForm({ version: nextVersion(iterations), title: "", content: "", status: "planned", releaseDate: "" })}>重置表单</Button></div></CardContent></Card>
            <Card><CardHeader><CardTitle>版本推进看板</CardTitle><CardDescription>查看每一轮迭代当前阶段，并推动发布回写。</CardDescription></CardHeader><CardContent className="grid gap-4 xl:grid-cols-3">{(["planned", "in_progress", "completed"] as ProductIteration["status"][]).map((status) => <div key={status} className="rounded-3xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><div className="text-sm font-semibold text-slate-900">{iterationMeta[status].label}</div><Badge variant="outline">{iterations.filter((item) => item.status === status).length}</Badge></div><div className="mt-4 space-y-3">{iterations.filter((item) => item.status === status).length ? iterations.filter((item) => item.status === status).map((item) => <div key={item.id} className="rounded-2xl bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-950">{item.title}</div><div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{item.version}</div></div><Badge className={iterationMeta[item.status]?.className || iterationMeta.planned.className}>{iterationMeta[item.status]?.label || item.status}</Badge></div><p className="mt-3 text-sm leading-6 text-slate-600">{item.content}</p><div className="mt-4 text-xs text-slate-400">发布时间 {fmt(item.release_date || item.created_at)} · 关联反馈 {item.feedback_ids?.length || 0}</div>{item.status === "planned" ? <div className="mt-4"><Button type="button" size="sm" variant="outline" disabled={updatingIterationId === item.id} onClick={() => { setUpdatingIterationId(item.id); void updateIterationStatus(item.id, "in_progress").then(() => loadData()).finally(() => setUpdatingIterationId(null)); }}>开始推进</Button></div> : null}{item.status === "in_progress" ? <div className="mt-4"><Button type="button" size="sm" disabled={updatingIterationId === item.id} onClick={() => { setUpdatingIterationId(item.id); void updateIterationStatus(item.id, "completed", { resolveLinkedFeedbacks: true }).then(() => loadData()).finally(() => setUpdatingIterationId(null)); }}>发布并回写反馈</Button></div> : null}</div>) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">当前阶段还没有版本记录。</div>}</div></div>)}</CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
