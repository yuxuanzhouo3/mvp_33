"use client"

import { useEffect, useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"

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

type SendResult = {
  success: boolean
  message: string
  sentCount?: number
}

const MIN_QUERY_LENGTH = 2
const SEARCH_DELAY_MS = 350
const COLD_PREVIEW_LIMIT = 120
const SEND_COOLDOWN_SECONDS = 60
const SEND_COOLDOWN_STORAGE_KEY = "market_notifications_send_cooldown_until"

const DEFAULT_TITLE = "🔥 你的专属AI学习计划已生成！"
const DEFAULT_CONTENT =
  "你已经3天没有背单词了，点击立即查看Mornchat为你定制的今日惊奇文章，保持学习手感！"
const DEFAULT_DEEP_LINK = "mornchat://market/article/daily"

function formatLastSeenDistance(value?: string | null): string {
  if (!value) return "从未回访"

  try {
    return formatDistanceToNow(new Date(value), {
      addSuffix: true,
      locale: zhCN,
    })
  } catch {
    return "时间未知"
  }
}

function formatLastSeenAbsolute(value?: string | null): string {
  if (!value) return "未记录"

  try {
    return new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "未记录"
  }
}

function readStoredCooldownUntil(): number {
  if (typeof window === "undefined") return 0
  const rawValue = Number(window.localStorage.getItem(SEND_COOLDOWN_STORAGE_KEY) || 0)
  return Number.isFinite(rawValue) ? rawValue : 0
}

export function NotificationsClient() {
  const [target, setTarget] = useState<TargetType>("test")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<NotificationUser[]>([])
  const [selectedUser, setSelectedUser] = useState<NotificationUser | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [coldSnapshot, setColdSnapshot] = useState<ColdRecallSnapshot | null>(null)
  const [isLoadingCold, setIsLoadingCold] = useState(false)
  const [coldError, setColdError] = useState<string | null>(null)
  const [selectedColdUserIds, setSelectedColdUserIds] = useState<string[]>([])

  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [content, setContent] = useState(DEFAULT_CONTENT)
  const [deepLink, setDeepLink] = useState(DEFAULT_DEEP_LINK)

  const [isSending, setIsSending] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const deepLinkSuffix = useMemo(() => {
    if (!deepLink.startsWith("mornchat://")) return deepLink
    return deepLink.replace("mornchat://", "")
  }, [deepLink])

  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - currentTime) / 1000))
  const isCoolingDown = cooldownRemaining > 0

  const visibleColdUsers = coldSnapshot?.users || []
  const selectedColdUsers = useMemo(
    () => visibleColdUsers.filter((user) => selectedColdUserIds.includes(user.id)),
    [selectedColdUserIds, visibleColdUsers],
  )

  const intendedRecipientCount = useMemo(() => {
    if (target === "test") {
      return selectedUser ? 1 : 0
    }

    if (selectedColdUserIds.length > 0) {
      return selectedColdUsers.length
    }

    return coldSnapshot?.eligibleTotalCount || 0
  }, [coldSnapshot?.eligibleTotalCount, selectedColdUserIds.length, selectedColdUsers.length, selectedUser, target])

  const sendButtonLabel = useMemo(() => {
    if (isSending) return "正在发送至 TPNS..."
    if (isCoolingDown) return `${cooldownRemaining}s 后可再次发送`
    if (target === "test") return "立即发送测试通知"
    if (selectedColdUserIds.length > 0) return `向已选 ${selectedColdUsers.length} 位用户发送`
    if (coldSnapshot) return `向 ${coldSnapshot.eligibleTotalCount} 位可召回用户发送`
    return "立即发送冷召回通知"
  }, [
    coldSnapshot,
    cooldownRemaining,
    isCoolingDown,
    isSending,
    selectedColdUserIds.length,
    selectedColdUsers.length,
    target,
  ])

  const sendDisabled =
    isSending ||
    isCoolingDown ||
    !title.trim() ||
    !content.trim() ||
    !deepLink.trim() ||
    (target === "test" && !selectedUser) ||
    (target === "cold" && !coldSnapshot) ||
    (target === "cold" && coldSnapshot?.eligibleTotalCount === 0)

  useEffect(() => {
    if (typeof window === "undefined") return
    const storedValue = readStoredCooldownUntil()
    if (storedValue > Date.now()) {
      setCooldownUntil(storedValue)
    }
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

    return () => {
      window.clearInterval(timer)
    }
  }, [cooldownUntil])

  useEffect(() => {
    if (searchQuery.trim().length < MIN_QUERY_LENGTH) {
      setSearchResults([])
      setSearchError(null)
      setIsSearching(false)
      return
    }

    let isMounted = true
    const controller = new AbortController()
    const handle = setTimeout(async () => {
      setIsSearching(true)
      setSearchError(null)

      try {
        const response = await fetch(
          `/api/market/notifications/users?q=${encodeURIComponent(searchQuery.trim())}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        )
        const json = await response.json().catch(() => null)
        if (!isMounted) return
        if (!response.ok || !json?.success) {
          throw new Error(json?.error || "搜索失败，请稍后再试")
        }
        setSearchResults(json.users || [])
      } catch (error) {
        if (!isMounted || (error as Error).name === "AbortError") return
        setSearchError(error instanceof Error ? error.message : "搜索失败")
        setSearchResults([])
      } finally {
        if (isMounted) {
          setIsSearching(false)
        }
      }
    }, SEARCH_DELAY_MS)

    return () => {
      isMounted = false
      clearTimeout(handle)
      controller.abort()
    }
  }, [searchQuery])

  const loadColdPreview = async (options?: { silent?: boolean }) => {
    setIsLoadingCold(true)
    setColdError(null)

    try {
      const response = await fetch(`/api/market/notifications/cold?limit=${COLD_PREVIEW_LIMIT}`, {
        cache: "no-store",
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "冷召回用户加载失败")
      }

      const nextSnapshot: ColdRecallSnapshot = {
        inactiveTotalCount: Number(json.inactiveTotalCount) || 0,
        eligibleTotalCount: Number(json.eligibleTotalCount) || 0,
        previewLimit: Number(json.previewLimit) || COLD_PREVIEW_LIMIT,
        reachedProcessingCap: Boolean(json.reachedProcessingCap),
        users: Array.isArray(json.users) ? json.users : [],
      }

      setColdSnapshot(nextSnapshot)
      setSelectedColdUserIds((current) =>
        current.filter((id) => nextSnapshot.users.some((user) => user.id === id)),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "冷召回用户加载失败"
      setColdError(message)
      if (!options?.silent) {
        toast.error(message)
      }
    } finally {
      setIsLoadingCold(false)
    }
  }

  useEffect(() => {
    if (target !== "cold") {
      setSelectedUser(null)
      return
    }

    if (!coldSnapshot && !isLoadingCold) {
      void loadColdPreview({ silent: true })
    }
  }, [coldSnapshot, isLoadingCold, target])

  const handleDeepLinkChange = (value: string) => {
    const normalized = value.trim().replace(/^mornchat:\/\//i, "")
    setDeepLink(`mornchat://${normalized}`)
  }

  const startSendCooldown = () => {
    const nextCooldownUntil = Date.now() + SEND_COOLDOWN_SECONDS * 1000
    setCooldownUntil(nextCooldownUntil)
    setCurrentTime(Date.now())
    window.localStorage.setItem(SEND_COOLDOWN_STORAGE_KEY, String(nextCooldownUntil))
  }

  const toggleColdUser = (userId: string) => {
    setSelectedColdUserIds((current) =>
      current.includes(userId)
        ? current.filter((value) => value !== userId)
        : [...current, userId],
    )
  }

  const handleSend = async () => {
    setSendResult(null)

    if (target === "test" && !selectedUser) {
      const message = "请先选择要测试的用户"
      setSendResult({ success: false, message })
      toast.error(message)
      return
    }

    if (target === "cold" && !coldSnapshot) {
      const message = "冷召回列表尚未加载完成，请稍后重试"
      setSendResult({ success: false, message })
      toast.error(message)
      return
    }

    if (!title.trim() || !content.trim() || !deepLink.trim()) {
      const message = "标题、内容和 Deep Link 不能为空"
      setSendResult({ success: false, message })
      toast.error(message)
      return
    }

    setIsSending(true)
    try {
      const response = await fetch("/api/market/notifications/send", {
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
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "推送失败，请检查日志")
      }

      const message =
        target === "cold"
          ? selectedColdUserIds.length > 0
            ? `已向 ${json.sentCount ?? 0} 台设备下发召回通知（所选 ${json.requestedCount ?? selectedColdUsers.length} 位用户）`
            : `已向 ${json.sentCount ?? 0} 台设备下发冷召回通知`
          : "测试推送已下发，请在目标设备上检查通知栏"

      const result: SendResult = {
        success: true,
        sentCount: Number(json.sentCount) || (target === "test" ? 1 : undefined),
        message,
      }

      setSendResult(result)
      toast.success(message)
      startSendCooldown()
    } catch (error) {
      const message = error instanceof Error ? error.message : "推送失败"
      setSendResult({ success: false, message })
      toast.error(message)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.92),_rgba(245,241,234,0.96)_45%,_rgba(237,231,222,1)_100%)] px-4 py-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <div className="flex flex-col gap-4 rounded-[28px] border border-black/10 bg-white/80 px-6 py-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-2xl bg-black p-3 text-white shadow-lg">
                <Bell size={24} />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">产品通知系统</h1>
                <p className="text-sm text-slate-500">Push Center / 冷召回与测试发送后台</p>
              </div>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              支持单设备测试推送、7 天未登录冷召回、Deep Link 跳转配置，以及发送结果回执与发送频控。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:w-[520px]">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                7 天未登录
              </div>
              <div className="mt-2 text-3xl font-semibold text-emerald-950">
                {coldSnapshot ? coldSnapshot.inactiveTotalCount : "--"}
              </div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/90 px-4 py-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-700">
                可推送
              </div>
              <div className="mt-2 text-3xl font-semibold text-sky-950">
                {coldSnapshot ? coldSnapshot.eligibleTotalCount : "--"}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
                发送冷却
              </div>
              <div className="mt-2 text-3xl font-semibold text-amber-950">
                {isCoolingDown ? `${cooldownRemaining}s` : "可发送"}
              </div>
            </div>
          </div>
        </div>

        {sendResult && (
          <div
            className={`rounded-[24px] border px-5 py-4 shadow-sm ${
              sendResult.success
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <div className="flex items-start gap-3">
              {sendResult.success ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <AlertCircle className="mt-0.5 h-5 w-5" />}
              <div className="space-y-1">
                <div className="text-sm font-semibold">{sendResult.success ? "发送结果" : "发送失败"}</div>
                <div className="text-sm">{sendResult.message}</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                  <Users className="h-5 w-5 text-blue-600" />
                  1. 选择推送目标
                </h2>
                {target === "cold" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    onClick={() => void loadColdPreview()}
                    disabled={isLoadingCold}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingCold ? "animate-spin" : ""}`} />
                    刷新名单
                  </button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label
                  className={`cursor-pointer rounded-[22px] border p-5 transition ${
                    target === "test"
                      ? "border-slate-900 bg-slate-950 text-white shadow-lg"
                      : "border-slate-200 bg-slate-50/70 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="target"
                    value="test"
                    className="hidden"
                    checked={target === "test"}
                    onChange={() => setTarget("test")}
                  />
                  <div className="text-lg font-semibold">测试发送 (单设备)</div>
                  <div className={`mt-2 text-sm ${target === "test" ? "text-slate-200" : "text-slate-500"}`}>
                    用于验证标题、正文、Deep Link 和 TPNS 实际下发效果。
                  </div>
                </label>

                <label
                  className={`cursor-pointer rounded-[22px] border p-5 transition ${
                    target === "cold"
                      ? "border-emerald-700 bg-emerald-600 text-white shadow-lg"
                      : "border-slate-200 bg-slate-50/70 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="target"
                    value="cold"
                    className="hidden"
                    checked={target === "cold"}
                    onChange={() => setTarget("cold")}
                  />
                  <div className="text-lg font-semibold">冷召回 (7天未登录)</div>
                  <div className={`mt-2 text-sm ${target === "cold" ? "text-emerald-50" : "text-slate-500"}`}>
                    可查看可推送用户并手动勾选一部分人发送。
                  </div>
                </label>
              </div>

              {target === "test" && (
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-800">查找目标用户</label>

                  {selectedUser ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <UserCircle size={22} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {selectedUser.name}
                            <span className="ml-2 text-xs font-normal text-slate-400">ID: {selectedUser.id}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {selectedUser.email || selectedUser.phone || "未留联系方式"} · 终端: {selectedUser.platform || "未知"}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                        onClick={() => {
                          setSelectedUser(null)
                          setSearchQuery("")
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="输入手机号、昵称、邮箱或 ID 搜索..."
                          className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>

                      {searchQuery.trim().length >= MIN_QUERY_LENGTH && (
                        <div className="absolute z-10 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border bg-white shadow-xl">
                          {isSearching && <div className="px-4 py-3 text-sm text-slate-500">正在搜索...</div>}
                          {searchError && <div className="px-4 py-3 text-sm text-rose-500">{searchError}</div>}
                          {!isSearching && !searchError && searchResults.length === 0 && (
                            <div className="px-4 py-3 text-sm text-slate-500">未找到匹配的用户</div>
                          )}
                          {searchResults.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left text-sm transition last:border-b-0 hover:bg-slate-50"
                              onClick={() => {
                                setSelectedUser(user)
                                setSearchResults([])
                                setSearchQuery(user.name)
                              }}
                            >
                              <div>
                                <div className="font-medium text-slate-900">{user.name}</div>
                                <div className="text-xs text-slate-500">{user.email || user.phone || "无联系方式"}</div>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                                {user.platform || "Android"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="mt-2 text-xs text-slate-400">系统仅显示已登记 Android 推送 Token 的用户。</p>
                    </div>
                  )}
                </div>
              )}

              {target === "cold" && (
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">冷召回用户预览</div>
                      <div className="mt-1 text-xs text-slate-500">
                        未勾选任何用户时，默认向全部可推送用户发送。勾选后只发送给所选用户。
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
                        onClick={() => setSelectedColdUserIds(visibleColdUsers.map((user) => user.id))}
                        disabled={visibleColdUsers.length === 0}
                      >
                        全选当前列表
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
                        onClick={() => setSelectedColdUserIds(visibleColdUsers.slice(0, 10).map((user) => user.id))}
                        disabled={visibleColdUsers.length === 0}
                      >
                        选中前 10 位
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
                        onClick={() => setSelectedColdUserIds([])}
                        disabled={selectedColdUserIds.length === 0}
                      >
                        清空勾选
                      </button>
                    </div>
                  </div>

                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs text-slate-500">7 天未登录总人数</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {isLoadingCold ? "--" : coldSnapshot?.inactiveTotalCount ?? 0}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs text-slate-500">具备推送能力</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">
                        {isLoadingCold ? "--" : coldSnapshot?.eligibleTotalCount ?? 0}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs text-slate-500">当前勾选发送</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{selectedColdUserIds.length}</div>
                    </div>
                  </div>

                  {coldSnapshot?.reachedProcessingCap && (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      当前系统最多处理前 2000 位冷召回用户，列表与发送范围也按这一上限执行。
                    </div>
                  )}

                  {coldError && (
                    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {coldError}
                    </div>
                  )}

                  <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      <span>可推送用户列表</span>
                      <span>
                        展示 {visibleColdUsers.length} / {coldSnapshot?.eligibleTotalCount ?? 0}
                      </span>
                    </div>

                    <ScrollArea className="h-[360px]">
                      <div className="divide-y divide-slate-100">
                        {isLoadingCold && (
                          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            正在加载冷召回名单...
                          </div>
                        )}

                        {!isLoadingCold && visibleColdUsers.length === 0 && (
                          <div className="px-4 py-6 text-sm text-slate-500">当前没有可推送的冷召回用户。</div>
                        )}

                        {visibleColdUsers.map((user) => {
                          const isSelected = selectedColdUserIds.includes(user.id)

                          return (
                            <label
                              key={user.id}
                              className={`flex cursor-pointer items-start gap-3 px-4 py-4 transition ${
                                isSelected ? "bg-emerald-50/70" : "hover:bg-slate-50"
                              }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleColdUser(user.id)}
                                className="mt-1"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">{user.name}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                                    {user.platform || "Android"}
                                  </span>
                                </div>

                                <div className="mt-1 text-xs text-slate-500">
                                  {user.email || user.phone || "未留联系方式"}
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                  <span>ID: {user.id}</span>
                                  <span>最近活跃: {formatLastSeenDistance(user.lastSeenAt)}</span>
                                  <span>{formatLastSeenAbsolute(user.lastSeenAt)}</span>
                                </div>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <section className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
                  <Bell className="h-5 w-5 text-emerald-600" />
                  2. 编辑推送内容
                </h2>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">通知标题</label>
                    <input
                      type="text"
                      value={title}
                      maxLength={60}
                      onChange={(event) => setTitle(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                      placeholder="例如：您有一份新的学习周报"
                    />
                    <div className="mt-2 text-right text-xs text-slate-400">{title.length}/60</div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">通知正文</label>
                    <textarea
                      value={content}
                      rows={6}
                      maxLength={200}
                      onChange={(event) => setContent(event.target.value)}
                      className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                      placeholder="输入要告诉用户的具体内容..."
                    />
                    <div className="mt-2 text-right text-xs text-slate-400">{content.length}/200</div>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
                  <LinkIcon className="h-5 w-5 text-violet-600" />
                  3. 落地页跳转
                </h2>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">点击通知后打开的页面</label>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                    <span className="rounded-xl bg-white px-3 py-2 font-mono text-sm text-slate-600 shadow-sm">
                      mornchat://
                    </span>
                    <input
                      type="text"
                      value={deepLinkSuffix}
                      onChange={(event) => handleDeepLinkChange(event.target.value)}
                      className="flex-1 bg-transparent px-2 py-2 font-mono text-sm outline-none"
                      placeholder="market/article/daily"
                    />
                  </div>

                  <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-violet-500">预览</div>
                    <div className="mt-2 break-all font-mono text-sm text-violet-950">{deepLink}</div>
                  </div>

                  <p className="mt-4 flex items-center gap-1 text-xs text-slate-500">
                    <AlertCircle size={12} /> Android 端需在 AndroidManifest 中配置对应 Scheme。
                  </p>
                </div>
              </section>
            </div>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-[28px] border border-black/10 bg-slate-950 p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">发送总览</div>
                  <div className="mt-2 text-2xl font-semibold">{target === "test" ? "测试发送" : "冷召回发送"}</div>
                </div>
                <ShieldCheck className="h-8 w-8 text-emerald-300" />
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl bg-white/10 px-4 py-4">
                  <div className="text-xs text-slate-300">本次将发送给</div>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="text-4xl font-semibold">{intendedRecipientCount}</span>
                    <span className="pb-1 text-sm text-slate-300">位用户</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-300">
                    {target === "cold" && selectedColdUserIds.length > 0
                      ? "当前为仅发送已勾选用户"
                      : target === "cold"
                        ? "当前为全量发送所有可推送冷召回用户"
                        : "当前为测试设备单点发送"}
                  </div>
                </div>

                <div className="rounded-2xl bg-white/10 px-4 py-4">
                  <div className="text-xs text-slate-300">发送保护</div>
                  <div className="mt-2 text-sm leading-6 text-slate-100">
                    {isCoolingDown
                      ? `冷却中，请等待 ${cooldownRemaining} 秒后再发送。`
                      : "发送成功后自动进入 60 秒冷却，防止重复点击。"}
                  </div>
                </div>

                {target === "cold" && (
                  <div className="rounded-2xl bg-white/10 px-4 py-4">
                    <div className="text-xs text-slate-300">冷召回范围说明</div>
                    <div className="mt-2 text-sm leading-6 text-slate-100">
                      {selectedColdUserIds.length > 0
                        ? `已勾选 ${selectedColdUserIds.length} 位用户，仅会向这部分用户发送。`
                        : `当前未勾选用户，默认向全部 ${coldSnapshot?.eligibleTotalCount ?? 0} 位可推送用户发送。`}
                    </div>
                    {coldSnapshot && coldSnapshot.eligibleTotalCount > coldSnapshot.users.length && (
                      <div className="mt-3 flex items-start gap-2 text-xs text-slate-300">
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        列表仅展示前 {coldSnapshot.previewLimit} 位可推送用户，未勾选时仍会全量发送。
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                  sendDisabled
                    ? "cursor-not-allowed bg-white/20 text-slate-300"
                    : "bg-emerald-500 text-white shadow-lg hover:bg-emerald-400"
                }`}
                disabled={sendDisabled}
                onClick={handleSend}
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={18} />}
                {sendButtonLabel}
              </button>
            </section>

            <section className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
              <div className="text-sm font-semibold text-slate-900">当前选择</div>
              <div className="mt-4 space-y-3">
                {target === "test" ? (
                  selectedUser ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-sm font-semibold text-slate-900">{selectedUser.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{selectedUser.email || selectedUser.phone || "未留联系方式"}</div>
                      <div className="mt-2 text-xs text-slate-500">设备: {selectedUser.platform || "Android"}</div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                      还没有选中测试用户。
                    </div>
                  )
                ) : selectedColdUsers.length > 0 ? (
                  <div className="space-y-2">
                    {selectedColdUsers.slice(0, 5).map((user) => (
                      <div key={user.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-sm font-semibold text-slate-900">{user.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{user.email || user.phone || "未留联系方式"}</div>
                      </div>
                    ))}
                    {selectedColdUsers.length > 5 && (
                      <div className="text-xs text-slate-500">其余 {selectedColdUsers.length - 5} 位已在列表中勾选。</div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                    当前未勾选用户，发送时会默认覆盖全部冷召回可推送用户。
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
