"use client"

import { useEffect, useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Bell, Loader2, RefreshCw, Search, Send, UserCircle, X } from "lucide-react"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

type TargetType = "test" | "cold"

type NotificationUser = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  platform?: string | null
  token: string
  region: "CN" | "INTL"
  lastSeenAt?: string | null
}

type ColdRecallSnapshot = {
  inactiveTotalCount: number
  eligibleTotalCount: number
  previewLimit: number
  reachedProcessingCap: boolean
  users: NotificationUser[]
}

const MIN_QUERY_LENGTH = 2
const SEARCH_DELAY_MS = 350
const COLD_PREVIEW_LIMIT = 120
const SEND_COOLDOWN_SECONDS = 60
const SEND_COOLDOWN_STORAGE_KEY = "market_notifications_send_cooldown_until"

function readStoredCooldownUntil() {
  if (typeof window === "undefined") return 0
  const rawValue = Number(window.localStorage.getItem(SEND_COOLDOWN_STORAGE_KEY) || 0)
  return Number.isFinite(rawValue) ? rawValue : 0
}

function formatLastSeen(value?: string | null) {
  if (!value) return "暂无记录"
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: zhCN })
  } catch {
    return "时间格式异常"
  }
}

export function NotificationsClient() {
  const [target, setTarget] = useState<TargetType>("test")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<NotificationUser[]>([])
  const [selectedUser, setSelectedUser] = useState<NotificationUser | null>(null)
  const [searchError, setSearchError] = useState("")
  const [isSearching, setIsSearching] = useState(false)

  const [coldSnapshot, setColdSnapshot] = useState<ColdRecallSnapshot | null>(null)
  const [selectedColdUserIds, setSelectedColdUserIds] = useState<string[]>([])
  const [coldError, setColdError] = useState("")
  const [isLoadingCold, setIsLoadingCold] = useState(false)

  const [title, setTitle] = useState("你的专属 AI 学习计划已生成")
  const [content, setContent] = useState("你已经有几天没有打开应用了，点击查看今天为你准备的推荐内容，继续保持学习节奏。")
  const [deepLink, setDeepLink] = useState("mornchat://market/article/daily")

  const [isSending, setIsSending] = useState(false)
  const [sendMessage, setSendMessage] = useState("")
  const [sendSuccess, setSendSuccess] = useState<boolean | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const visibleColdUsers = coldSnapshot?.users || []
  const selectedColdUsers = useMemo(
    () => visibleColdUsers.filter((user) => selectedColdUserIds.includes(user.id)),
    [selectedColdUserIds, visibleColdUsers],
  )
  const intendedRecipientCount =
    target === "test" ? (selectedUser ? 1 : 0) : selectedColdUserIds.length > 0 ? selectedColdUsers.length : coldSnapshot?.eligibleTotalCount || 0
  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - currentTime) / 1000))
  const isCoolingDown = cooldownRemaining > 0
  const deepLinkSuffix = deepLink.replace(/^mornchat:\/\//i, "")

  useEffect(() => {
    const storedValue = readStoredCooldownUntil()
    if (storedValue > Date.now()) setCooldownUntil(storedValue)
  }, [])

  useEffect(() => {
    if (!cooldownUntil) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)
      if (cooldownUntil <= now) {
        window.localStorage.removeItem(SEND_COOLDOWN_STORAGE_KEY)
        setCooldownUntil(0)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  useEffect(() => {
    if (searchQuery.trim().length < MIN_QUERY_LENGTH) {
      setSearchResults([])
      setSearchError("")
      setIsSearching(false)
      return
    }

    let isMounted = true
    const controller = new AbortController()
    const handle = window.setTimeout(async () => {
      setIsSearching(true)
      setSearchError("")
      try {
        const response = await fetch(`/api/market-admin/notifications/users?q=${encodeURIComponent(searchQuery.trim())}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const json = await response.json().catch(() => null)
        if (!isMounted) return
        if (!response.ok || !json?.success) throw new Error(json?.error || "用户搜索失败")
        setSearchResults(Array.isArray(json.users) ? json.users : [])
      } catch (error) {
        if (!isMounted || (error as Error).name === "AbortError") return
        setSearchError(error instanceof Error ? error.message : "用户搜索失败")
      } finally {
        if (isMounted) setIsSearching(false)
      }
    }, SEARCH_DELAY_MS)

    return () => {
      isMounted = false
      window.clearTimeout(handle)
      controller.abort()
    }
  }, [searchQuery])

  useEffect(() => {
    if (target === "cold" && !coldSnapshot && !isLoadingCold) void loadColdPreview(true)
  }, [coldSnapshot, isLoadingCold, target])

  async function loadColdPreview(silent = false) {
    setIsLoadingCold(true)
    setColdError("")
    try {
      const response = await fetch(`/api/market-admin/notifications/cold?limit=${COLD_PREVIEW_LIMIT}`, { cache: "no-store" })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) throw new Error(json?.error || "冷召回用户预览加载失败")
      const nextSnapshot: ColdRecallSnapshot = {
        inactiveTotalCount: Number(json.inactiveTotalCount) || 0,
        eligibleTotalCount: Number(json.eligibleTotalCount) || 0,
        previewLimit: Number(json.previewLimit) || COLD_PREVIEW_LIMIT,
        reachedProcessingCap: Boolean(json.reachedProcessingCap),
        users: Array.isArray(json.users) ? json.users : [],
      }
      setColdSnapshot(nextSnapshot)
      setSelectedColdUserIds((current) => current.filter((id) => nextSnapshot.users.some((user) => user.id === id)))
    } catch (error) {
      const message = error instanceof Error ? error.message : "冷召回用户预览加载失败"
      setColdError(message)
      if (!silent) toast.error(message)
    } finally {
      setIsLoadingCold(false)
    }
  }

  function startSendCooldown() {
    const nextCooldownUntil = Date.now() + SEND_COOLDOWN_SECONDS * 1000
    setCooldownUntil(nextCooldownUntil)
    setCurrentTime(Date.now())
    window.localStorage.setItem(SEND_COOLDOWN_STORAGE_KEY, String(nextCooldownUntil))
  }

  async function handleSend() {
    if (target === "test" && !selectedUser) return toast.error("请先选择测试用户")
    if (target === "cold" && !coldSnapshot) return toast.error("请先加载冷召回名单")
    if (!title.trim() || !content.trim() || !deepLink.trim()) return toast.error("标题、内容和 Deep Link 不能为空")

    setIsSending(true)
    setSendMessage("")
    setSendSuccess(null)
    try {
      const response = await fetch("/api/market-admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: target,
          title: title.trim(),
          content: content.trim(),
          deepLink: deepLink.trim(),
          deviceToken: target === "test" ? selectedUser?.token : undefined,
          selectedUserIds: target === "cold" && selectedColdUserIds.length > 0 ? selectedColdUserIds : undefined,
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) throw new Error(json?.error || "推送发送失败")
      const message =
        target === "cold"
          ? selectedColdUserIds.length > 0
            ? `已发送 ${json.sentCount ?? 0} 条通知，请求目标 ${json.requestedCount ?? selectedColdUsers.length} 人。`
            : `已向全部符合条件的用户发送 ${json.sentCount ?? 0} 条通知。`
          : "测试通知发送成功。"
      setSendSuccess(true)
      setSendMessage(message)
      toast.success(message)
      startSendCooldown()
    } catch (error) {
      const message = error instanceof Error ? error.message : "推送发送失败"
      setSendSuccess(false)
      setSendMessage(message)
      toast.error(message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="rounded-2xl bg-slate-950 p-3 text-white">
                  <Bell className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold">Push Center</h1>
                  <p className="text-sm text-muted-foreground">测试推送与冷召回通知</p>
                </div>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">先选择目标，再填写通知文案和 Deep Link。发送成功后会进入 60 秒冷却。</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <div className="text-xs text-emerald-700">7+ 天未活跃</div>
                <div className="mt-1 text-2xl font-semibold">{coldSnapshot?.inactiveTotalCount ?? "--"}</div>
              </div>
              <div className="rounded-2xl bg-sky-50 px-4 py-3">
                <div className="text-xs text-sky-700">可推送用户</div>
                <div className="mt-1 text-2xl font-semibold">{coldSnapshot?.eligibleTotalCount ?? "--"}</div>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <div className="text-xs text-amber-700">冷却</div>
                <div className="mt-1 text-2xl font-semibold">{isCoolingDown ? `${cooldownRemaining}s` : "Ready"}</div>
              </div>
            </div>
          </div>
        </section>

        {sendMessage ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${sendSuccess ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {sendMessage}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_360px]">
          <section className="space-y-6 rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex gap-3">
              <Button variant={target === "test" ? "default" : "outline"} onClick={() => setTarget("test")}>测试发送</Button>
              <Button variant={target === "cold" ? "default" : "outline"} onClick={() => setTarget("cold")}>冷召回发送</Button>
              {target === "cold" ? (
                <Button variant="outline" onClick={() => void loadColdPreview()} disabled={isLoadingCold}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingCold ? "animate-spin" : ""}`} />
                  刷新名单
                </Button>
              ) : null}
            </div>

            {target === "test" ? (
              <div className="space-y-3">
                <label className="text-sm font-medium">搜索测试用户</label>
                {selectedUser ? (
                  <div className="flex items-center justify-between rounded-2xl border bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-emerald-100 p-2 text-emerald-600"><UserCircle className="h-5 w-5" /></div>
                      <div>
                        <div className="font-medium">{selectedUser.name}</div>
                        <div className="text-xs text-muted-foreground">{selectedUser.email || selectedUser.phone || "无公开联系方式"} | {selectedUser.platform || "Unknown"}</div>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setSelectedUser(null); setSearchQuery("") }} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full rounded-2xl border px-10 py-3 text-sm outline-none focus:border-slate-900"
                        placeholder="输入用户名、邮箱、手机号或用户 ID"
                      />
                    </div>
                    {searchError ? <div className="text-sm text-rose-600">{searchError}</div> : null}
                    {isSearching ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> 正在搜索...</div> : null}
                    {searchResults.length > 0 ? (
                      <div className="overflow-hidden rounded-2xl border">
                        {searchResults.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            className="flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                            onClick={() => { setSelectedUser(user); setSearchResults([]); setSearchQuery(user.name) }}
                          >
                            <div>
                              <div className="font-medium">{user.name}</div>
                              <div className="text-xs text-muted-foreground">{user.email || user.phone || "无公开联系方式"} | {user.platform || "Unknown"}</div>
                            </div>
                            <div className="text-xs text-muted-foreground">{user.id}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedColdUserIds(visibleColdUsers.slice(0, 10).map((user) => user.id))} disabled={visibleColdUsers.length === 0}>选前 10 人</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedColdUserIds([])} disabled={selectedColdUserIds.length === 0}>清空选择</Button>
                </div>
                {coldError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{coldError}</div> : null}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">预览上限<br /><span className="text-xl font-semibold">{coldSnapshot?.previewLimit ?? COLD_PREVIEW_LIMIT}</span></div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">可发送<br /><span className="text-xl font-semibold">{coldSnapshot?.eligibleTotalCount ?? 0}</span></div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">已选中<br /><span className="text-xl font-semibold">{selectedColdUserIds.length}</span></div>
                </div>
                <ScrollArea className="h-[360px] rounded-2xl border">
                  <div className="divide-y">
                    {isLoadingCold ? <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> 正在加载名单...</div> : null}
                    {!isLoadingCold && visibleColdUsers.length === 0 ? <div className="px-4 py-6 text-sm text-muted-foreground">当前没有可发送的冷召回用户。</div> : null}
                    {visibleColdUsers.map((user) => {
                      const isSelected = selectedColdUserIds.includes(user.id)
                      return (
                        <label key={user.id} className={`flex cursor-pointer gap-3 px-4 py-3 ${isSelected ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
                          <input type="checkbox" checked={isSelected} onChange={() => setSelectedColdUserIds((current) => current.includes(user.id) ? current.filter((value) => value !== user.id) : [...current, user.id])} className="mt-1" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{user.name}</div>
                            <div className="text-xs text-muted-foreground">{user.email || user.phone || "无公开联系方式"} | {user.platform || "Android"}</div>
                            <div className="text-xs text-muted-foreground">最近活跃: {formatLastSeen(user.lastSeenAt)}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <label className="text-sm font-medium">通知标题</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-slate-900" />
                <div className="text-right text-xs text-muted-foreground">{title.length}/60</div>

                <label className="text-sm font-medium">通知内容</label>
                <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={6} maxLength={200} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-slate-900" />
                <div className="text-right text-xs text-muted-foreground">{content.length}/200</div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">Deep Link</label>
                <div className="flex items-center rounded-2xl border bg-slate-50 px-3">
                  <span className="font-mono text-sm text-muted-foreground">mornchat://</span>
                  <input value={deepLinkSuffix} onChange={(event) => setDeepLink(`mornchat://${event.target.value.replace(/^mornchat:\/\//i, "")}`)} className="flex-1 bg-transparent px-2 py-3 font-mono text-sm outline-none" />
                </div>
                <div className="rounded-2xl bg-violet-50 px-4 py-3 font-mono text-sm text-violet-950">{deepLink}</div>
              </div>
            </div>
          </section>

          <aside className="space-y-4 rounded-3xl border bg-slate-950 p-6 text-white shadow-sm">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Summary</div>
              <div className="mt-2 text-2xl font-semibold">{target === "test" ? "测试通知" : "冷召回通知"}</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
              预计触达 <span className="text-3xl font-semibold">{intendedRecipientCount}</span> 人
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
              {isCoolingDown ? `还需等待 ${cooldownRemaining} 秒才能再次发送。` : "当前可立即发送，发送后会进入 60 秒冷却。"}
            </div>
            <Button className="w-full" disabled={isSending || isCoolingDown || !title.trim() || !content.trim() || !deepLink.trim() || (target === "test" && !selectedUser) || (target === "cold" && !coldSnapshot)} onClick={() => void handleSend()}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              发送通知
            </Button>
          </aside>
        </div>
      </div>
    </div>
  )
}
