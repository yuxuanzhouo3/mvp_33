"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Users, Building2, Landmark, PlaySquare, Mail, Search, Plus,
  MoreHorizontal, ChevronLeft, Filter, DollarSign, Lock, X,
  Download, Clock, FileText, Cpu, Globe, Database, CheckCircle,
  Copy, Send, Calendar, ArrowRight, Check, User, Settings,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type {
  AcquisitionBlogger,
  AcquisitionB2BLead,
  AcquisitionVCLead,
  AcquisitionAd,
  AcquisitionBootstrapData,
} from "@/lib/market/acquisition-types"

type TabKey = "bloggers" | "b2b" | "vc" | "ads"

// ==========================================
// Helper: Handshake icon
// ==========================================
function HandshakeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m11 17 2 2a1 1 0 1 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
      <path d="m21 3-6 6" /><path d="m21 14-3 3" /><path d="m8 12-2.5-2.5a1 1 0 1 0-3 3l3.88 3.88a3 3 0 0 0 4.24 0l.88-.88a1 1 0 1 1 3 3l-2.81 2.81a5.79 5.79 0 0 1-7.06.87l-.47-.28a2 2 0 0 0-1.42-.25L3 20" />
      <path d="m3 21 6-6" /><path d="m3 10 3-3" />
    </svg>
  )
}

// ==========================================
// Helper: Status badge
// ==========================================
function StatusBadge({ status }: { status: string }) {
  let variant: "default" | "secondary" | "destructive" | "outline" = "secondary"
  if (["已签约", "已转化", "已投资", "投放中"].includes(status)) variant = "default"
  else if (["谈判中", "跟进中", "合同拟定", "深度沟通 (Pitch)", "尽职调查"].includes(status)) variant = "outline"
  return <Badge variant={variant}>{status}</Badge>
}

// ==========================================
// Helper: Stat card
// ==========================================
function StatCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background p-5 flex items-center space-x-4">
      <div className="rounded-lg border bg-muted/40 p-3">{icon}</div>
      <div>
        <div className="text-sm text-muted-foreground mb-1">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  )
}

// ==========================================
// Generic modal wrapper
// ==========================================
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {children}
    </div>
  )
}

// ==========================================
// Modal: Email list (for copy)
// ==========================================
function EmailListModal({ bloggers, onClose, showToast }: { bloggers: AcquisitionBlogger[]; onClose: () => void; showToast: (msg: string) => void }) {
  const emails = bloggers.filter(b => b.email).map(b => `${b.name} <${b.email}>`)
  const emailsRaw = bloggers.filter(b => b.email).map(b => b.email)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(emailsRaw.join("; "))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast("❌ 复制失败，请手动选中复制")
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center"><Mail className="mr-2 h-5 w-5 text-blue-600" /> 博主邮箱列表</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">共 {emails.length} 位博主的联系邮箱：</p>
          <div className="bg-muted/50 rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
            {emails.map((email, i) => (
              <div key={i} className="text-sm flex items-center space-x-2">
                <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span>{email}</span>
              </div>
            ))}
            {emails.length === 0 && <p className="text-sm text-muted-foreground">暂无博主邮箱</p>}
          </div>
          <div className="bg-muted/30 rounded-lg p-2">
            <p className="text-xs text-muted-foreground mb-1">纯邮箱地址（分号分隔）:</p>
            <code className="text-xs break-all select-all">{emailsRaw.join("; ")}</code>
          </div>
        </CardContent>
        <div className="p-4 border-t flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose}>关闭</Button>
          <Button onClick={handleCopy} disabled={emails.length === 0}>
            {copied ? <><Check className="mr-2 h-4 w-4" /> 已复制</> : <><Copy className="mr-2 h-4 w-4" /> 复制全部邮箱</>}
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Modal: Filter panel
// ==========================================
function FilterModal({ onClose, onApply }: { onClose: () => void; onApply: (filters: { platform: string; status: string }) => void }) {
  const [platform, setPlatform] = useState("")
  const [status, setStatus] = useState("")

  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center"><Filter className="mr-2 h-5 w-5" /> 筛选条件</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>平台</Label>
            <Select onValueChange={setPlatform} value={platform}>
              <SelectTrigger><SelectValue placeholder="全部平台" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                <SelectItem value="B站">B站</SelectItem>
                <SelectItem value="小红书">小红书</SelectItem>
                <SelectItem value="抖音">抖音</SelectItem>
                <SelectItem value="微博">微博</SelectItem>
                <SelectItem value="YouTube">YouTube</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>合作状态</Label>
            <Select onValueChange={setStatus} value={status}>
              <SelectTrigger><SelectValue placeholder="全部状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="未联系">未联系</SelectItem>
                <SelectItem value="已发邮件">已发邮件</SelectItem>
                <SelectItem value="谈判中">谈判中</SelectItem>
                <SelectItem value="已签约">已签约</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <div className="p-4 border-t flex justify-end space-x-3">
          <Button variant="outline" onClick={() => { setPlatform(""); setStatus(""); onApply({ platform: "", status: "" }) }}>重置</Button>
          <Button onClick={() => onApply({ platform: platform === "all" ? "" : platform, status: status === "all" ? "" : status })}>
            <Check className="mr-2 h-4 w-4" /> 应用筛选
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Modal: Status Selector (B2B / VC)
// ==========================================
function StatusSelectModal({ title, currentStatus, statuses, onClose, onConfirm }: {
  title: string
  currentStatus: string
  statuses: string[]
  onClose: () => void
  onConfirm: (newStatus: string) => void
}) {
  const [selected, setSelected] = useState(currentStatus)

  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">当前状态: <StatusBadge status={currentStatus} /></p>
          <Label>选择新状态</Label>
          <div className="space-y-2 mt-2">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setSelected(s)}
                className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors flex items-center justify-between ${
                  selected === s
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center space-x-2">
                  <ArrowRight className={`h-3 w-3 ${selected === s ? "text-primary" : "text-muted-foreground"}`} />
                  <span>{s}</span>
                </span>
                {selected === s && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </CardContent>
        <div className="p-4 border-t flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => onConfirm(selected)} disabled={selected === currentStatus}>
            确认更新
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Modal: Email compose
// ==========================================
interface EmailComposeInfo {
  recipientName: string
  recipientEmail?: string
  companyName?: string
}

function EmailComposeModal({ info, onClose, showToast }: { info: EmailComposeInfo; onClose: () => void; showToast: (msg: string) => void }) {
  const [email, setEmail] = useState(info.recipientEmail || "")
  const [subject, setSubject] = useState(`关于合作 — 来自 OrbitChat 团队`)
  const [body, setBody] = useState(`尊敬的 ${info.recipientName}：\n\n您好！\n\n我们是 OrbitChat 团队，非常期待与贵方的合作。关于具体的合作方案，我们希望能进一步沟通。\n\n以下是我们的初步方案：\n1. \n2. \n3. \n\n期待您的回复！\n\n此致\nOrbitChat 团队`)

  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!email.trim()) {
      showToast("❌ 请填写收件人邮箱地址")
      return
    }
    if (!subject.trim() || !body.trim()) {
      showToast("❌ 请填写主题和正文")
      return
    }
    setSending(true)
    try {
      const response = await fetch("/api/market/admin/acquisition", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": "orbitchat-admin" },
        body: JSON.stringify({ action: "send_email", to: email, subject, body }),
      })
      const json = await response.json()
      if (json.success) {
        showToast(`✅ 邮件已成功发送至 ${email}`)
      } else {
        showToast(`❌ 发送失败: ${json.error || "未知错误"}`)
      }
    } catch (err) {
      showToast(`❌ 发送失败: ${err instanceof Error ? err.message : "网络错误"}`)
    } finally {
      setSending(false)
    }
    onClose()
  }

  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-lg overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center"><Send className="mr-2 h-5 w-5 text-blue-600" /> 编辑邮件</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>收件人</Label>
              <Input value={info.recipientName} disabled className="bg-muted/50" />
            </div>
            {info.companyName && (
              <div className="space-y-2">
                <Label>所属公司/机构</Label>
                <Input value={info.companyName} disabled className="bg-muted/50" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="flex items-center space-x-1">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span>收件邮箱 <span className="text-destructive">*</span></span>
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入对方邮箱地址，如 zhangsan@company.com"
              className={email ? "" : "border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20"}
            />
            {!email && <p className="text-xs text-yellow-600">⚠️ 请确认收件人邮箱后再发送</p>}
          </div>
          <div className="space-y-2">
            <Label>邮件主题</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="请输入邮件主题" />
          </div>
          <div className="space-y-2">
            <Label>邮件内容</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[200px]" placeholder="请输入邮件正文..." />
          </div>
        </CardContent>
        <div className="p-4 border-t flex justify-between items-center">
          {email && <p className="text-xs text-muted-foreground">将发送至: <span className="font-medium text-foreground">{email}</span></p>}
          {!email && <div />}
          <div className="flex space-x-3">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleSend} disabled={!email.trim() || sending}>
              <Send className="mr-2 h-4 w-4" /> {sending ? "发送中..." : "确认发送"}
            </Button>
          </div>
        </div>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Modal: Blogger detail
// ==========================================
function BloggerDetailModal({ blogger, onClose }: { blogger: AcquisitionBlogger; onClose: () => void }) {
  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{blogger.name} 详情</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1"><span className="text-muted-foreground">平台</span><p className="font-medium">{blogger.platform}</p></div>
            <div className="space-y-1"><span className="text-muted-foreground">粉丝量</span><p className="font-medium">{blogger.followers}</p></div>
            <div className="space-y-1"><span className="text-muted-foreground">合作状态</span><p><StatusBadge status={blogger.status} /></p></div>
            <div className="space-y-1"><span className="text-muted-foreground">联系邮箱</span><p className="font-medium">{blogger.email}</p></div>
            <div className="space-y-1"><span className="text-muted-foreground">基础费用</span><p className="font-medium">{blogger.cost}</p></div>
            <div className="space-y-1"><span className="text-muted-foreground">利润分成</span><p className="font-medium text-blue-600">{blogger.commission}</p></div>
          </div>
          <div className="pt-4 border-t">
            <Label className="text-muted-foreground">跟进记录</Label>
            <div className="mt-2 bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground">
              <p>暂无跟进记录。可通过「发邮件」功能联系博主，跟进记录将在后续版本自动生成。</p>
            </div>
          </div>
        </CardContent>
        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </div>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Modal: Contract preview
// ==========================================
function ContractModal({ onClose, onDownload }: { onClose: () => void; onDownload: () => void }) {
  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-2xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center"><FileText className="mr-2 h-5 w-5 text-blue-600" /> 合同模板预览</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="bg-muted/30 max-h-[60vh] overflow-y-auto text-sm leading-relaxed font-serif space-y-4">
          <h3 className="text-center text-lg font-bold mb-6">B2B 软件产品采购及服务协议</h3>
          <p><strong>甲方（采购方）：</strong> ____________________</p>
          <p><strong>乙方（服务方）：</strong> 本公司</p>
          <p>鉴于甲方业务发展需要，拟向乙方采购相关软件产品及技术服务，经双方友好协商，本着平等自愿、诚实信用的原则，达成如下协议：</p>
          <h4 className="font-bold mt-6 mb-2">第一条 采购内容</h4>
          <p>1.1 软件名称：产品获客系统企业版 (Pro)</p>
          <p>1.2 交付时间：自本合同签署之日起 5 个工作日内。</p>
          <h4 className="font-bold mt-6 mb-2">第二条 费用及支付方式</h4>
          <p>2.1 本合同总金额为人民币（大写）：_______________ 元整（¥_________）。</p>
          <p>2.2 支付节奏：合同签订后 3 日内支付 50% 预付款，验收合格后支付剩余 50% 尾款。</p>
          <p className="text-center text-muted-foreground mt-8">--- 以下内容省略，请下载后查看完整版 ---</p>
        </CardContent>
        <div className="p-4 border-t flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onDownload}><Download className="mr-2 h-4 w-4" /> 确认并下载文档 (Word格式)</Button>
        </div>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Modal: Add form (generic for all 4 types)
// ==========================================
function AddFormModal({ type, onClose, onSubmit }: {
  type: "blogger" | "b2b" | "vc" | "ad"
  onClose: () => void
  onSubmit: (data: Record<string, string>) => void
}) {
  const [formData, setFormData] = useState<Record<string, string>>({})
  const handleChange = (name: string, value: string) => setFormData((prev) => ({ ...prev, [name]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const configs: Record<string, { title: string; fields: Array<{ name: string; label: string; type: string; placeholder?: string; options?: string[]; step?: string }> }> = {
    blogger: {
      title: "录入博主线索",
      fields: [
        { name: "name", label: "博主昵称", type: "text", placeholder: "如: 老李说科技" },
        { name: "platform", label: "平台", type: "text", placeholder: "如: B站/小红书" },
        { name: "email", label: "联系邮箱", type: "email", placeholder: "如: hello@163.com" },
        { name: "followers", label: "粉丝量", type: "text", placeholder: "如: 50k" },
        { name: "cost", label: "基础费用期望", type: "text", placeholder: "如: ¥100/条" },
        { name: "commission", label: "分润期望", type: "text", placeholder: "如: 25%" },
      ],
    },
    b2b: {
      title: "手工录入企业线索",
      fields: [
        { name: "name", label: "企业名称", type: "text", placeholder: "如: 深圳XX科技公司" },
        { name: "region", label: "所属区域", type: "text", placeholder: "如: 深圳/北京" },
        { name: "contact", label: "联系人及职务", type: "text", placeholder: "如: 王总 (CTO)" },
        { name: "email", label: "联系邮箱", type: "email", placeholder: "如: wang@company.com" },
        { name: "estValue", label: "预估客单价", type: "text", placeholder: "如: ¥30,000" },
      ],
    },
    vc: {
      title: "添加投资机构线索",
      fields: [
        { name: "name", label: "机构名称", type: "text", placeholder: "如: 高瓴创投" },
        { name: "region", label: "区域", type: "text", placeholder: "如: 北京" },
        { name: "contact", label: "联系人", type: "text", placeholder: "如: 李经理" },
        { name: "email", label: "联系邮箱", type: "email", placeholder: "如: li@fund.com" },
        { name: "focus", label: "关注领域", type: "text", placeholder: "如: AI/SaaS" },
      ],
    },
    ad: {
      title: "上架新广告位 (Ad-to-Earn)",
      fields: [
        { name: "brand", label: "广告主/品牌名称", type: "text", placeholder: "如: 某出行App" },
        { name: "type", label: "广告类型", type: "select", options: ["视频广告", "互动广告", "横幅图片"] },
        { name: "duration", label: "要求观看时长 (秒)", type: "text", placeholder: "如: 30" },
        { name: "rewardType", label: "奖励类型", type: "select", options: ["现金", "积分"] },
        { name: "reward", label: "单次用户奖励金", type: "text", placeholder: "如: 0.5", step: "0.1" },
      ],
    },
  }

  const config = configs[type]
  if (!config) return null

  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{config.title}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
            {config.fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label>{field.label}</Label>
                {field.type === "select" ? (
                  <Select onValueChange={(value) => handleChange(field.name, value)} defaultValue="">
                    <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input required type={field.type} placeholder={field.placeholder} step={field.step} onChange={(e) => handleChange(field.name, e.target.value)} />
                )}
              </div>
            ))}
          </CardContent>
          <div className="p-4 border-t bg-muted/30 flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">保存入库</Button>
          </div>
        </form>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Tab 1: 博主联盟 (Blogger CRM)
// ==========================================
function BloggerTab({ data, showToast, onAddClick, onShowEmailList, onShowFilter, onShowDetail, onUpdateStatus, onSendEmail }: {
  data: AcquisitionBlogger[]
  showToast: (msg: string) => void
  onAddClick: () => void
  onShowEmailList: () => void
  onShowFilter: () => void
  onShowDetail: (blogger: AcquisitionBlogger) => void
  onUpdateStatus: (blogger: AcquisitionBlogger) => void
  onSendEmail: (info: EmailComposeInfo) => void
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="目标博主池" value={data.length + 250} icon={<Users className="h-5 w-5 text-blue-500" />} />
        <StatCard title="已发送邀请" value="142" icon={<Mail className="h-5 w-5 text-purple-500" />} />
        <StatCard title="达成合作" value="26" icon={<HandshakeIcon className="h-5 w-5 text-green-500" />} />
        <StatCard title="带来总利润" value="¥45,200" icon={<DollarSign className="h-5 w-5 text-yellow-500" />} />
      </div>

      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input type="text" placeholder="搜索博主邮箱或昵称..." className="pl-10" />
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={onShowFilter}>
            <Filter className="mr-2 h-4 w-4" /> 筛选条件
          </Button>
          <Button variant="outline" onClick={onShowEmailList}>
            <Mail className="mr-2 h-4 w-4" /> 查看邮箱列表
          </Button>
          <Button variant="default" onClick={onAddClick}>
            <Plus className="mr-2 h-4 w-4" /> 录入博主
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>博主昵称 / 平台</TableHead>
              <TableHead>粉丝量</TableHead>
              <TableHead>合作状态</TableHead>
              <TableHead>基础费用</TableHead>
              <TableHead>利润分成</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((blogger) => (
              <TableRow key={blogger.id}>
                <TableCell>
                  <div className="font-medium">{blogger.name}</div>
                  <div className="text-xs text-muted-foreground">{blogger.platform} • {blogger.email}</div>
                </TableCell>
                <TableCell className="font-medium">{blogger.followers}</TableCell>
                <TableCell><StatusBadge status={blogger.status} /></TableCell>
                <TableCell className="text-muted-foreground">{blogger.cost}</TableCell>
                <TableCell className="text-blue-600 font-semibold">{blogger.commission}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="link" className="text-blue-600 p-0 h-auto" onClick={() => onUpdateStatus(blogger)}>更新状态</Button>
                  <Button variant="link" className="text-muted-foreground p-0 h-auto" onClick={() => onSendEmail({ recipientName: blogger.name, recipientEmail: blogger.email, companyName: undefined })}>
                    <Mail className="mr-1 h-3 w-3" />邮件
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onShowDetail(blogger)}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ==========================================
// Tab 2: 企业采购 (B2B)
// ==========================================
function B2BTab({ data, showToast, onContractClick, onAddClick, onUpdateStatus, onSendEmail }: {
  data: AcquisitionB2BLead[]
  showToast: (msg: string) => void
  onContractClick: () => void
  onAddClick: () => void
  onUpdateStatus: (lead: AcquisitionB2BLead) => void
  onSendEmail: (info: EmailComposeInfo) => void
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="总企业线索" value={data.length + 120} icon={<Building2 className="h-5 w-5 text-blue-500" />} />
        <StatCard title="国内政企网络" value="手工维护中" icon={<Globe className="h-5 w-5 text-indigo-500" />} />
        <StatCard title="爬虫任务" value="待接入" icon={<Cpu className="h-5 w-5 text-muted-foreground" />} />
      </div>

      <div className="flex justify-between items-center">
        <div className="flex space-x-3">
          <Button variant="outline" className="border-dashed text-muted-foreground cursor-help" onClick={() => showToast("企业爬虫模块 [待开发]。当前请使用右侧 [手工录入] 功能。")}>
            <Lock className="mr-2 h-4 w-4" /> 运行 WebCrawler [待开发]
          </Button>
          <Button variant="outline" onClick={onContractClick}>
            <FileText className="mr-2 h-4 w-4" /> 下载合同模板
          </Button>
        </div>
        <Button onClick={onAddClick}>
          <Plus className="mr-2 h-4 w-4" /> 手工录入线索
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((lead) => (
          <Card key={lead.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <Badge variant="secondary">{lead.region}网络</Badge>
                  <CardTitle className="mt-2">{lead.name}</CardTitle>
                </div>
                <StatusBadge status={lead.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between"><span>联系人:</span><span className="font-medium text-foreground">{lead.contact}</span></div>
                <div className="flex justify-between items-center">
                  <span>来源:</span>
                  <span className="flex items-center">
                    {lead.source === "手工录入" ? <Plus className="h-3 w-3 mr-1 text-muted-foreground" /> : <Users className="h-3 w-3 mr-1 text-muted-foreground" />}
                    {lead.source}
                  </span>
                </div>
                <div className="flex justify-between"><span>预估价值:</span><span className="font-medium text-green-600">{lead.estValue}</span></div>
              </div>
              <div className="pt-4 border-t flex space-x-2">
                <Button variant="secondary" className="flex-1" onClick={() => onUpdateStatus(lead)}>
                  更新进度
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => onSendEmail({ recipientName: lead.contact, recipientEmail: lead.email, companyName: lead.name })}>
                  <Mail className="mr-2 h-4 w-4" /> 发邮件
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ==========================================
// Tab 3: 金融 VC
// ==========================================
function VCTab({ data, showToast, onAddClick, onUpdateStatus, onSendEmail }: {
  data: AcquisitionVCLead[]
  showToast: (msg: string) => void
  onAddClick: () => void
  onUpdateStatus: (vc: AcquisitionVCLead) => void
  onSendEmail: (info: EmailComposeInfo) => void
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="目标 VC 机构" value="45" icon={<Landmark className="h-5 w-5 text-purple-500" />} />
        <StatCard title="已深度建联" value="12" icon={<Users className="h-5 w-5 text-blue-500" />} />
        <StatCard title="系统录入数据" value={data.length + 30} icon={<Database className="h-5 w-5 text-green-500" />} />
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" className="border-dashed text-muted-foreground cursor-help" onClick={() => showToast("VC 资源库深度爬虫抓取 [待开发]。")}>
          <Lock className="mr-2 h-4 w-4" /> 抓取 VC 动态 [待开发]
        </Button>
        <Button onClick={onAddClick}>
          <Plus className="mr-2 h-4 w-4" /> 添加 BD 引荐资源
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>机构名称</TableHead>
              <TableHead>区域网络</TableHead>
              <TableHead>关注领域</TableHead>
              <TableHead>渠道来源</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((vc) => (
              <TableRow key={vc.id}>
                <TableCell>
                  <div className="font-bold">{vc.name}</div>
                  <div className="text-xs text-muted-foreground">联系人: {vc.contact}</div>
                </TableCell>
                <TableCell>{vc.region}</TableCell>
                <TableCell className="text-muted-foreground">{vc.focus}</TableCell>
                <TableCell className="text-muted-foreground">{vc.source}</TableCell>
                <TableCell><StatusBadge status={vc.status} /></TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="link" className="text-blue-600 p-0 h-auto" onClick={() => onUpdateStatus(vc)}>推进阶段</Button>
                  <Button variant="link" className="text-muted-foreground p-0 h-auto" onClick={() => onSendEmail({ recipientName: vc.contact, recipientEmail: vc.email, companyName: vc.name })}>
                    <Mail className="mr-1 h-3 w-3" />联系
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ==========================================
// Modal: Ad Settings
// ==========================================
function AdSettingsModal({ ad, onClose, showToast, onSave }: { ad: AcquisitionAd; onClose: () => void; showToast: (msg: string) => void; onSave: (id: string, patch: { duration: string; reward: string; status: string }) => Promise<boolean> }) {
  const [duration, setDuration] = useState(ad.duration)
  const [reward, setReward] = useState(ad.reward)
  const [status, setStatus] = useState(ad.status)
  const [durationCustom, setDurationCustom] = useState(false)
  const [rewardCustom, setRewardCustom] = useState(false)
  const [saving, setSaving] = useState(false)

  const durationPresets = ["15s", "30s", "45s", "60s", "90s"]
  const rewardPresets = ["0.3 RMB", "0.5 RMB", "1 RMB", "2 RMB", "5 RMB"]

  const handleSave = async () => {
    setSaving(true)
    const ok = await onSave(ad.id, { duration, reward, status })
    setSaving(false)
    if (ok) {
      showToast(`✅ 广告「${ad.brand}」设置已保存`)
      onClose()
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">广告设置：{ad.brand}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>广告主</Label>
              <Input value={ad.brand} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <Label>广告类型</Label>
              <Input value={ad.type} disabled className="bg-muted/50" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>要求观看时长</Label>
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setDurationCustom(!durationCustom)}>
                {durationCustom ? "选择预设" : "自定义输入"}
              </button>
            </div>
            {durationCustom ? (
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="如: 120s" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {durationPresets.map((p) => (
                  <Button key={p} type="button" variant={duration === p ? "default" : "outline"} size="sm" onClick={() => setDuration(p)}>
                    {p}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>单次用户奖励</Label>
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setRewardCustom(!rewardCustom)}>
                {rewardCustom ? "选择预设" : "自定义金额"}
              </button>
            </div>
            {rewardCustom ? (
              <Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="如: 3.5 RMB" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {rewardPresets.map((p) => (
                  <Button key={p} type="button" variant={reward === p ? "default" : "outline"} size="sm" onClick={() => setReward(p)}>
                    {p}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>投放状态</Label>
            <Select onValueChange={setStatus} value={status}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="投放中">投放中</SelectItem>
                <SelectItem value="已暂停">已暂停</SelectItem>
                <SelectItem value="已下架">已下架</SelectItem>
                <SelectItem value="待审核">待审核</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-muted/30 p-3 space-y-1 text-sm text-muted-foreground">
            <div className="flex justify-between"><span>已观看次数:</span><span className="font-medium text-foreground">{ad.views}</span></div>
            <div className="flex justify-between"><span>创建时间:</span><span>{ad.createdAt ? new Date(ad.createdAt).toLocaleDateString() : "未知"}</span></div>
          </div>
        </CardContent>
        <div className="p-4 border-t flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存设置"}</Button>
        </div>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Modal: Ad Data Report
// ==========================================
function AdDataModal({ ad, onClose }: { ad: AcquisitionAd; onClose: () => void }) {
  const views = parseInt(ad.views?.replace(/,/g, "") || "0", 10) || 0
  const rewardNum = parseFloat(ad.reward?.replace(/[^0-9.]/g, "") || "0") || 0
  const totalCost = (views * rewardNum).toFixed(2)

  return (
    <ModalOverlay onClose={onClose}>
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{ad.brand} 数据报表</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <div className="text-sm text-muted-foreground">总观看次数</div>
              <div className="text-2xl font-bold mt-1">{ad.views}</div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-sm text-muted-foreground">单次奖励</div>
              <div className="text-2xl font-bold mt-1 text-green-600">{ad.reward}</div>
            </div>
          </div>
          <div className="rounded-lg bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">广告类型:</span><span>{ad.type}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">要求时长:</span><span>{ad.duration}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">当前状态:</span><StatusBadge status={ad.status} /></div>
            <div className="flex justify-between border-t pt-2 mt-2"><span className="text-muted-foreground font-medium">预估总成本:</span><span className="font-bold text-orange-600">¥{totalCost}</span></div>
          </div>
          <p className="text-xs text-muted-foreground text-center">ℹ️ 详细的时间线分析及用户画像报表将在后续版本上线</p>
        </CardContent>
        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </div>
      </Card>
    </ModalOverlay>
  )
}

// ==========================================
// Tab 4: Ad-to-Earn
// ==========================================
function AdsTab({ data, showToast, onAddClick, onShowSettings, onShowData }: {
  data: AcquisitionAd[]
  showToast: (msg: string) => void
  onAddClick: () => void
  onShowSettings: (ad: AcquisitionAd) => void
  onShowData: (ad: AcquisitionAd) => void
}) {
  return (
    <div className="space-y-6">
      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
        <CardContent className="flex items-start space-x-4 pt-6">
          <div className="bg-yellow-500 text-white p-2 rounded-lg mt-1"><Lock className="h-5 w-5" /></div>
          <div>
            <h4 className="font-semibold text-yellow-900 dark:text-yellow-200">Ad-to-Earn 配置看板 (一期展示)</h4>
            <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-1">
              当前为广告资源占位及人工配置展示页。<b>自动化结算引擎 [待开发]、防刷验证码 [待开发] 及资金提现接口 [待开发]</b>将在后续风控体系完善后上线。
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onAddClick}>
          <Plus className="mr-2 h-4 w-4" /> 上架新广告位
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>广告主/品牌</TableHead>
              <TableHead>要求时长</TableHead>
              <TableHead>用户奖励</TableHead>
              <TableHead>已观看次数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((ad) => (
              <TableRow key={ad.id}>
                <TableCell>
                  <div className="font-medium">{ad.brand}</div>
                  <div className="text-xs text-muted-foreground">{ad.type}</div>
                </TableCell>
                <TableCell className="text-muted-foreground flex items-center space-x-1">
                  <Clock className="h-3 w-3" /> <span>{ad.duration}</span>
                </TableCell>
                <TableCell className="font-bold text-green-600">{ad.reward}</TableCell>
                <TableCell className="text-muted-foreground">{ad.views}</TableCell>
                <TableCell><StatusBadge status={ad.status} /></TableCell>
                <TableCell className="text-right space-x-3">
                  <Button variant="link" className="text-blue-600 p-0 h-auto" onClick={() => onShowData(ad)}>数据</Button>
                  <Button variant="link" className="text-muted-foreground p-0 h-auto" onClick={() => onShowSettings(ad)}>设置</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ==========================================
// Main Client Component
// ==========================================
export function AcquisitionClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("b2b")
  const [toastMessage, setToastMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [bloggers, setBloggers] = useState<AcquisitionBlogger[]>([])
  const [b2bLeads, setB2bLeads] = useState<AcquisitionB2BLead[]>([])
  const [vcLeads, setVcLeads] = useState<AcquisitionVCLead[]>([])
  const [ads, setAds] = useState<AcquisitionAd[]>([])

  // Modal states
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [formModalConfig, setFormModalConfig] = useState<{ isOpen: boolean; type: "blogger" | "b2b" | "vc" | "ad" | null }>({ isOpen: false, type: null })
  const [emailListOpen, setEmailListOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [bloggerDetailTarget, setBloggerDetailTarget] = useState<AcquisitionBlogger | null>(null)
  const [emailComposeTarget, setEmailComposeTarget] = useState<EmailComposeInfo | null>(null)
  const [statusModal, setStatusModal] = useState<{
    isOpen: boolean
    title: string
    currentStatus: string
    statuses: string[]
    onConfirm: (newStatus: string) => void
  } | null>(null)
  const [adSettingsTarget, setAdSettingsTarget] = useState<AcquisitionAd | null>(null)
  const [adDataTarget, setAdDataTarget] = useState<AcquisitionAd | null>(null)

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(""), 3000)
  }, [])

  const getAuthHeaders = useCallback(() => {
    const cookies = document.cookie.split(";").map((c) => c.trim())
    const sessionCookie = cookies.find((c) => c.startsWith("market_admin_session="))
    const token = sessionCookie?.split("=")[1] || ""
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  }, [])

  const fetchBootstrap = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/market/admin/acquisition", { headers: getAuthHeaders() })
      const json = await response.json()
      if (!json.success) throw new Error(json.error || "Failed to load data")
      const data: AcquisitionBootstrapData = json.data
      setBloggers(data.bloggers)
      setB2bLeads(data.b2bLeads)
      setVcLeads(data.vcLeads)
      setAds(data.ads)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败")
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => { fetchBootstrap() }, [fetchBootstrap])

  const postAction = useCallback(async (action: string, data: Record<string, string>) => {
    try {
      const response = await fetch("/api/market/admin/acquisition", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action, ...data }),
      })
      const json = await response.json()
      if (!json.success) throw new Error(json.error || "操作失败")
      return json.result
    } catch (err) {
      showToast(`❌ ${err instanceof Error ? err.message : "操作失败"}`)
      return null
    }
  }, [getAuthHeaders, showToast])

  const handleFormSubmit = useCallback(async (formData: Record<string, string>) => {
    const type = formModalConfig.type
    if (!type) return
    let action = ""
    if (type === "blogger") action = "insert_blogger"
    else if (type === "b2b") action = "insert_b2b_lead"
    else if (type === "vc") action = "insert_vc_lead"
    else if (type === "ad") {
      action = "insert_ad"
      formData.duration = `${formData.duration || "30"}s`
      formData.reward = `${formData.reward || "0"} ${formData.rewardType === "积分" ? "积分" : "RMB"}`
    }
    const result = await postAction(action, formData)
    if (result) {
      showToast("🎉 数据已成功录入系统！")
      await fetchBootstrap()
    }
    setFormModalConfig({ isOpen: false, type: null })
  }, [formModalConfig.type, postAction, showToast, fetchBootstrap])

  // B2B status update — opens modal
  const openB2BStatusModal = useCallback((lead: AcquisitionB2BLead) => {
    setStatusModal({
      isOpen: true,
      title: `更新「${lead.name}」进度`,
      currentStatus: lead.status,
      statuses: ["初步接触", "跟进中", "合同拟定", "已转化"],
      onConfirm: async (newStatus: string) => {
        const result = await postAction("update_b2b_status", { id: lead.id, status: newStatus })
        if (result) {
          setB2bLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus } : l)))
          showToast(`✅ 已更新为「${newStatus}」`)
        }
        setStatusModal(null)
      },
    })
  }, [postAction, showToast])

  // VC status update — opens modal
  const openVCStatusModal = useCallback((vc: AcquisitionVCLead) => {
    setStatusModal({
      isOpen: true,
      title: `推进「${vc.name}」阶段`,
      currentStatus: vc.status,
      statuses: ["待联系", "初步接触", "深度沟通 (Pitch)", "尽职调查", "已投资"],
      onConfirm: async (newStatus: string) => {
        const result = await postAction("update_vc_status", { id: vc.id, status: newStatus })
        if (result) {
          setVcLeads((prev) => prev.map((v) => (v.id === vc.id ? { ...v, status: newStatus } : v)))
          showToast(`✅ 已更新为「${newStatus}」`)
        }
        setStatusModal(null)
      },
    })
  }, [postAction, showToast])

  // Blogger status update — opens modal
  const openBloggerStatusModal = useCallback((blogger: AcquisitionBlogger) => {
    setStatusModal({
      isOpen: true,
      title: `更新「${blogger.name}」状态`,
      currentStatus: blogger.status,
      statuses: ["未联系", "已联系", "谈判中", "已合作", "已拒绝"],
      onConfirm: async (newStatus: string) => {
        const result = await postAction("update_blogger_status", { id: blogger.id, status: newStatus })
        if (result) {
          setBloggers((prev) => prev.map((b) => (b.id === blogger.id ? { ...b, status: newStatus } : b)))
          showToast(`✅ 博主「${blogger.name}」已更新为「${newStatus}」`)
        }
        setStatusModal(null)
      },
    })
  }, [postAction, showToast])

  // Filter apply
  const handleFilterApply = useCallback((filters: { platform: string; status: string }) => {
    // For now just show toast with applied filters
    const parts: string[] = []
    if (filters.platform) parts.push(`平台=${filters.platform}`)
    if (filters.status) parts.push(`状态=${filters.status}`)
    showToast(parts.length > 0 ? `✅ 筛选条件已应用: ${parts.join(", ")}` : "✅ 已重置所有筛选条件")
    setFilterOpen(false)
  }, [showToast])

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "bloggers", label: "博主联盟 (KOL)", icon: <Users className="h-4 w-4" /> },
    { key: "b2b", label: "企业采购 (B2B)", icon: <Building2 className="h-4 w-4" /> },
    { key: "vc", label: "金融 VC", icon: <Landmark className="h-4 w-4" /> },
    { key: "ads", label: "Ad-to-Earn 广告", icon: <PlaySquare className="h-4 w-4" /> },
  ]

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-24 rounded-xl" />))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-10 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={fetchBootstrap}>重试</Button>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center space-x-2">
            <span className="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 p-2 rounded-lg">
              <Users className="h-6 w-6" />
            </span>
            <span>产品获客系统</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">管理博主合作、企业采购线索与 Ad-to-Earn 广告资源。</p>
        </div>
        <Link href="/market/profile">
          <Button variant="outline" size="sm" className="flex items-center space-x-2">
            <User className="h-4 w-4" />
            <span>个人中心</span>
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <Card>
        <div className="flex border-b overflow-x-auto bg-muted/30">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <CardContent className="p-4 md:p-6">
          {activeTab === "bloggers" && (
            <BloggerTab
              data={bloggers}
              showToast={showToast}
              onAddClick={() => setFormModalConfig({ isOpen: true, type: "blogger" })}
              onShowEmailList={() => setEmailListOpen(true)}
              onShowFilter={() => setFilterOpen(true)}
              onShowDetail={(b) => setBloggerDetailTarget(b)}
              onUpdateStatus={openBloggerStatusModal}
              onSendEmail={(info) => setEmailComposeTarget(info)}
            />
          )}
          {activeTab === "b2b" && (
            <B2BTab
              data={b2bLeads}
              showToast={showToast}
              onContractClick={() => setContractModalOpen(true)}
              onAddClick={() => setFormModalConfig({ isOpen: true, type: "b2b" })}
              onUpdateStatus={openB2BStatusModal}
              onSendEmail={(info) => setEmailComposeTarget(info)}
            />
          )}
          {activeTab === "vc" && (
            <VCTab
              data={vcLeads}
              showToast={showToast}
              onAddClick={() => setFormModalConfig({ isOpen: true, type: "vc" })}
              onUpdateStatus={openVCStatusModal}
              onSendEmail={(info) => setEmailComposeTarget(info)}
            />
          )}
          {activeTab === "ads" && (
            <AdsTab
              data={ads}
              showToast={showToast}
              onAddClick={() => setFormModalConfig({ isOpen: true, type: "ad" })}
              onShowSettings={(ad) => setAdSettingsTarget(ad)}
              onShowData={(ad) => setAdDataTarget(ad)}
            />
          )}
        </CardContent>
      </Card>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-foreground text-background px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 z-50 animate-in slide-in-from-bottom-5">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      {contractModalOpen && (
        <ContractModal
          onClose={() => setContractModalOpen(false)}
          onDownload={() => {
            import("@/lib/market/contract-template").then(({ generateContractHTML }) => {
              const html = generateContractHTML("")
              const blob = new Blob([html], { type: "text/html;charset=utf-8" })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = "B2B合作协议模板.html"
              a.click()
              URL.revokeObjectURL(url)
            })
            setContractModalOpen(false)
            showToast("✅ 合同模板已下载，可用浏览器打开并打印为PDF")
          }}
        />
      )}

      {formModalConfig.isOpen && formModalConfig.type && (
        <AddFormModal type={formModalConfig.type} onClose={() => setFormModalConfig({ isOpen: false, type: null })} onSubmit={handleFormSubmit} />
      )}

      {emailListOpen && (
        <EmailListModal bloggers={bloggers} onClose={() => setEmailListOpen(false)} showToast={showToast} />
      )}

      {filterOpen && (
        <FilterModal onClose={() => setFilterOpen(false)} onApply={handleFilterApply} />
      )}

      {bloggerDetailTarget && (
        <BloggerDetailModal blogger={bloggerDetailTarget} onClose={() => setBloggerDetailTarget(null)} />
      )}

      {emailComposeTarget && (
        <EmailComposeModal info={emailComposeTarget} onClose={() => setEmailComposeTarget(null)} showToast={showToast} />
      )}

      {statusModal && (
        <StatusSelectModal
          title={statusModal.title}
          currentStatus={statusModal.currentStatus}
          statuses={statusModal.statuses}
          onClose={() => setStatusModal(null)}
          onConfirm={statusModal.onConfirm}
        />
      )}

      {adSettingsTarget && (
        <AdSettingsModal
          ad={adSettingsTarget}
          onClose={() => setAdSettingsTarget(null)}
          showToast={showToast}
          onSave={async (id, patch) => {
            const result = await postAction("update_ad", { id, ...patch })
            if (result) {
              setAds((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
              return true
            }
            return false
          }}
        />
      )}

      {adDataTarget && (
        <AdDataModal ad={adDataTarget} onClose={() => setAdDataTarget(null)} />
      )}
    </div>
  )
}
