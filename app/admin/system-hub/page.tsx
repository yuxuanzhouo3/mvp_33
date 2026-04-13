import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bell,
  ChartColumnIncreasing,
  Database,
  Megaphone,
  Radar,
  RefreshCcw,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const systems = [
  {
    id: "01",
    title: "后台 / 数据系统",
    icon: Database,
    href: "/admin/dashboard",
    hrefLabel: "打开后台数据面板",
    summary:
      "统一拿到注册、支付、设备、广告与运营数据，并用可视化趋势图持续呈现。",
    coverage: ["注册数据", "支付数据", "设备信息", "可视化趋势图", "广告系统"],
    next: ["增加 CLI 管理入口", "开放 API 接口层", "支持代码模块化插件管理"],
  },
  {
    id: "02",
    title: "产品获客系统",
    icon: Radar,
    href: "/market/acquisition/distribution",
    hrefLabel: "打开获客与分发工作区",
    summary:
      "围绕博主、企业采购、广告商和 VC 等合作对象做线索采集、合作触达、投放研究与转化分析。",
    coverage: [
      "博主 cost + article + platform + frequency",
      "企业采购 web crawler + BD",
      "广告主投放来源研究与热门广告位分析",
    ],
    next: ["接入更多公开线索源", "沉淀合作画像模板", "补齐 ROI 与 user rate 归因"],
  },
  {
    id: "03",
    title: "产品通知系统",
    icon: Bell,
    href: "/market/notifications",
    hrefLabel: "打开通知系统",
    summary:
      "做冷召回、惊喜文章推送、日/周通知编排，并持续优化 DAU、MAU 与召回 KPI。",
    coverage: ["邮件", "站内红点与文案", "移动端通知", "第三方渠道如 WeChat"],
    next: ["接入更多账号渠道", "补齐日/周编排", "追踪召回率与激活回流"],
  },
  {
    id: "04",
    title: "用户分析系统",
    icon: ChartColumnIncreasing,
    href: "/admin/analysis",
    hrefLabel: "打开用户分析系统",
    summary:
      "围绕用户喜欢什么、不喜欢什么、为什么流失、哪些功能最有价值，形成持续迭代闭环。",
    coverage: [
      "注册 / 登录来源分析",
      "createAt / lastLogin / logout 行为",
      "click / hover / scroll / time-on-page",
      "反馈优缺点与版本回写",
    ],
    next: [
      "做 feature ranking",
      "补齐 retention / habit / first-use 指标",
      "把差体验功能移除，把刚需功能补回产品",
    ],
  },
  {
    id: "05",
    title: "用户裂变系统",
    icon: Users,
    href: "/market/fission",
    hrefLabel: "打开裂变系统",
    summary:
      "围绕邀请、红包、广告奖励、登录奖励、会员升级与 AI 次数补给做增长机制设计。",
    coverage: ["邀请注册 / 支付奖励", "广告 15s 奖励", "连续登录奖励", "会员升级与优惠券", "AI 次数补给"],
    next: ["抽象奖励引擎", "统一风控规则", "接入更多分享与邀请码玩法"],
  },
  {
    id: "06",
    title: "产品营销系统 /market",
    icon: Megaphone,
    href: "/market",
    hrefLabel: "打开营销系统",
    summary:
      "把获客、通知、分析、裂变汇总到统一营销系统里，用 AI + 人工共同推进注册、活跃、支付与传播。",
    coverage: ["/market 总控", "活动 / 裂变 / 通知 / 获客入口", "人工审核 + AI 辅助"],
    next: ["把 02/03/04/05 进一步汇总到 06", "加入第二阶段人机对话", "接入互联网大数据爬取能力"],
  },
] as const;

const loopSteps = [
  {
    title: "收集",
    text: "从 Web、App、Email、通知回执、文章反馈、广告数据与客服对话持续收集真实用户信号。",
  },
  {
    title: "分析",
    text: "AI 分析用户喜欢的刚需功能、不舒服的体验点、流失节点、注册来源、登录习惯和核心使用路径。",
  },
  {
    title: "决策",
    text: "把 disliked features 放进移除 / 改造列表，把 must-have features 放进下一版需求池，并由人工确认优先级。",
  },
  {
    title: "发布",
    text: "把迭代版本、通知策略、获客话术、裂变奖励与营销活动一起发布，并对照 KPI 做验证。",
  },
  {
    title: "回流",
    text: "把新一轮数据与反馈再次回流到分析系统，形成持续迭代的产品闭环。",
  },
] as const;

const directions = [
  "数据系统增加 CLI、API 和插件化模块，方便批量处理、自动化拉数和后台扩展。",
  "获客、通知、分析、裂变全部进入统一营销总控，由人工智能做建议，人类做确认与执行。",
  "通知系统要覆盖 email、text、red point、mobile push、WeChat 等多渠道，并追踪召回率。",
  "用户分析必须直连产品决策：删掉用户明显不舒服的功能，补上用户最喜欢的刚需能力。",
] as const;

export default function AdminSystemHubPage() {
  return (
    <div className="space-y-6 pb-8">
      <Card className="border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
              System Hub
            </Badge>
            <Badge variant="outline">6 modules</Badge>
            <Badge variant="outline">AI + Human</Badge>
          </div>
          <CardTitle className="text-3xl font-semibold tracking-tight text-slate-950">
            后台系统总览
          </CardTitle>
          <CardDescription className="max-w-4xl text-sm leading-7 text-slate-600">
            这里把后台、获客、通知、用户分析、裂变、营销六个系统放进同一张图里。核心目标不是堆功能，而是形成一个能持续发现问题、修正体验、放大增长的闭环后台。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Data</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">注册 / 支付 / 设备 / 广告</div>
            <div className="mt-2 text-sm text-slate-600">所有业务数据统一进入后台趋势面板。</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Growth</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">获客 / 裂变 / 通知</div>
            <div className="mt-2 text-sm text-slate-600">把新客获取、老客召回和分享传播连成一个运营链路。</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Feedback Loop</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              分析 {"->"} 决策 {"->"} 发布 {"->"} 回流
            </div>
            <div className="mt-2 text-sm text-slate-600">用户分析系统直接驱动版本迭代，而不是停留在报表层。</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Execution</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">AI + 人工协作</div>
            <div className="mt-2 text-sm text-slate-600">AI 给建议、汇总和预测，人类负责审核、判断和上线。</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {systems.map((system) => {
          const Icon = system.icon;
          return (
            <Card key={system.id} className="border-slate-200 shadow-sm">
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-100 p-3">
                      <Icon className="h-5 w-5 text-slate-700" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{system.id}</div>
                      <CardTitle className="mt-1 text-xl text-slate-950">{system.title}</CardTitle>
                    </div>
                  </div>
                  <Badge variant="outline">Live path</Badge>
                </div>
                <CardDescription className="leading-7 text-slate-600">
                  {system.summary}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="text-sm font-medium text-slate-900">当前范围</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {system.coverage.map((item) => (
                      <Badge key={item} variant="outline" className="bg-slate-50 text-slate-700">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-900">下一步改造</div>
                  <div className="mt-3 space-y-2">
                    {system.next.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button asChild className="w-full sm:w-auto">
                  <Link href={system.href}>{system.hrefLabel}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-sky-200 bg-sky-50/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-950">
            <RefreshCcw className="h-5 w-5 text-sky-700" />
            用户分析系统的反馈闭环
          </CardTitle>
          <CardDescription className="leading-7 text-slate-700">
            这里对应 PDF 里最核心的要求：不断发现用户体验不舒服的功能并去掉，找到用户群体真正喜欢的刚需功能再加上去。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-5">
          {loopSteps.map((step) => (
            <div key={step.title} className="rounded-2xl border border-sky-100 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">{step.title}</div>
              <div className="mt-3 text-sm leading-7 text-slate-600">{step.text}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-950">
            <Sparkles className="h-5 w-5 text-emerald-700" />
            总体改造方向
          </CardTitle>
          <CardDescription className="leading-7 text-slate-700">
            02/03/04/05 逐步汇总进 06 营销系统，由人工智能提供建议与自动化能力，由人工做确认、审核和最终决策。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {directions.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-700">
              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
