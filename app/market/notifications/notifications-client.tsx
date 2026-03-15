"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Link as LinkIcon,
  Search,
  Send,
  UserCircle,
  Users,
  X,
} from "lucide-react"

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

type SendResult = {
  success: boolean
  message: string
  sentCount?: number
}

const MIN_QUERY_LENGTH = 2
const SEARCH_DELAY_MS = 350
const DEFAULT_TITLE = "🔥 你的专属AI学习计划已生成！"
const DEFAULT_CONTENT =
  "你已经3天没有背单词了，点击立即查看Mornchat为你定制的今日惊奇文章，保持学习手感！"
const DEFAULT_DEEP_LINK = "mornchat://market/article/daily"

export function NotificationsClient() {
  const [target, setTarget] = useState<TargetType>("test")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<NotificationUser[]>([])
  const [selectedUser, setSelectedUser] = useState<NotificationUser | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [content, setContent] = useState(DEFAULT_CONTENT)
  const [deepLink, setDeepLink] = useState(DEFAULT_DEEP_LINK)

  const [isSending, setIsSending] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)

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
        if (!isMounted || (error as Error).name === "AbortError") {
          return
        }
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

  useEffect(() => {
    if (target === "cold") {
      setSelectedUser(null)
    }
  }, [target])

  const deepLinkSuffix = useMemo(() => {
    if (!deepLink.startsWith("mornchat://")) return deepLink
    return deepLink.replace("mornchat://", "")
  }, [deepLink])

  const handleDeepLinkChange = (value: string) => {
    const normalized = value.trim().replace(/^mornchat:\/\//i, "")
    setDeepLink(`mornchat://${normalized}`)
  }

  const handleSend = async () => {
    setSendResult(null)
    if (target === "test" && !selectedUser) {
      setSendResult({ success: false, message: "请先选择要测试的用户" })
      return
    }

    if (!title.trim() || !content.trim()) {
      setSendResult({ success: false, message: "标题和内容不能为空" })
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
        }),
      })

      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "推送失败，请检查日志")
      }

      const message =
        target === "cold"
          ? `已向 ${json.sentCount ?? 0} 台设备下发冷启动通知`
          : "推送指令已下发"

      setSendResult({
        success: true,
        sentCount: Number(json.sentCount) || (target === "test" ? 1 : undefined),
        message,
      })
    } catch (error) {
      setSendResult({
        success: false,
        message: error instanceof Error ? error.message : "推送失败",
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-lg bg-black p-2 text-white">
              <Bell size={24} />
            </div>
            <h1 className="text-2xl font-semibold">产品通知系统 (推送中心)</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            冷召回与惊奇文章推送策略管理，支持多端触达与效果追踪。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Users className="h-5 w-5 text-blue-600" />
                1. 选择推送目标
              </h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label
                    className={`flex-1 cursor-pointer rounded-xl border p-4 transition ${
                      target === "test"
                        ? "border-black bg-gray-50 shadow-sm"
                        : "border-gray-200 hover:border-gray-300"
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
                    <div className="font-semibold">测试发送 (单设备)</div>
                    <div className="text-xs text-muted-foreground">用于调试或指定用户发送</div>
                  </label>
                  <label
                    className={`flex-1 cursor-pointer rounded-xl border p-4 transition ${
                      target === "cold"
                        ? "border-black bg-gray-50 shadow-sm"
                        : "border-gray-200 hover:border-gray-300"
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
                    <div className="font-semibold">冷召回 (7天未登录)</div>
                    <div className="text-xs text-muted-foreground">向沉默用户批量推送</div>
                  </label>
                </div>

                {target === "test" && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      查找目标用户
                    </label>

                    {selectedUser ? (
                      <div className="flex items-center justify-between rounded-lg border border-green-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                            <UserCircle size={22} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold">
                              {selectedUser.name}
                              <span className="ml-2 text-xs font-normal text-gray-400">ID: {selectedUser.id}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {selectedUser.email || selectedUser.phone || "未留联系方式"} · 终端: {selectedUser.platform || "未知"}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-md p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
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
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="输入手机号、昵称、邮箱或 ID 搜索..."
                            className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                        {searchQuery.trim().length >= MIN_QUERY_LENGTH && (
                          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-white shadow-xl">
                            {isSearching && (
                              <div className="px-4 py-3 text-sm text-gray-500">正在搜索...</div>
                            )}
                            {searchError && (
                              <div className="px-4 py-3 text-sm text-red-500">{searchError}</div>
                            )}
                            {!isSearching && !searchError && searchResults.length === 0 && (
                              <div className="px-4 py-3 text-sm text-gray-500">未找到匹配的用户</div>
                            )}
                            {searchResults.map((user) => (
                              <button
                                key={user.id}
                                type="button"
                                className="flex w-full items-center justify-between border-b border-gray-50 px-4 py-3 text-left text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setSelectedUser(user)
                                  setSearchResults([])
                                  setSearchQuery(user.name)
                                }}
                              >
                                <div>
                                  <div className="font-medium text-gray-800">{user.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {user.email || user.phone || "无联系方式"}
                                  </div>
                                </div>
                                <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-500">
                                  {user.platform || "Android"}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-[11px] text-gray-400">
                          系统仅显示已登记 Android 推送 Token 的用户。
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Bell className="h-5 w-5 text-green-600" />
                2. 编辑推送内容
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">通知标题</label>
                  <input
                    type="text"
                    value={title}
                    maxLength={60}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-3 text-sm outline-none transition focus:border-black focus:ring-1 focus:ring-black"
                    placeholder="例如：您有一份新的学习周报"
                  />
                  <div className="mt-1 text-right text-xs text-gray-400">{title.length}/60</div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">通知正文</label>
                  <textarea
                    value={content}
                    rows={3}
                    maxLength={200}
                    onChange={(event) => setContent(event.target.value)}
                    className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm outline-none transition focus:border-black focus:ring-1 focus:ring-black"
                    placeholder="输入要告诉用户的具体内容..."
                  />
                  <div className="mt-1 text-right text-xs text-gray-400">{content.length}/200</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <LinkIcon className="h-5 w-5 text-purple-600" />
                3. 落地页跳转 (Deep Link)
              </h2>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  点击通知后打开的页面
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
                  <span className="rounded bg-gray-200 px-3 py-1 font-mono text-sm text-gray-600">mornchat://</span>
                  <input
                    type="text"
                    value={deepLinkSuffix}
                    onChange={(event) => handleDeepLinkChange(event.target.value)}
                    className="flex-1 bg-transparent p-2 font-mono text-sm outline-none"
                    placeholder="market/article/daily"
                  />
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                  <AlertCircle size={12} /> Android 端需在 AndroidManifest 中配置对应 Scheme。
                </p>
              </div>
            </section>

            <div className="flex items-center gap-4">
              <button
                type="button"
                className={`flex-1 rounded-xl py-4 font-semibold text-white transition ${
                  isSending
                    ? "bg-gray-400"
                    : sendResult?.success
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-black hover:bg-gray-900"
                }`}
                disabled={isSending}
                onClick={handleSend}
              >
                {isSending ? (
                  <span className="flex items-center justify-center gap-2 text-sm">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    正在发送至 TPNS...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2 text-sm">
                    <Send size={18} />
                    立即发送通知
                  </span>
                )}
              </button>
            </div>
            {sendResult && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  sendResult.success
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  {sendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{sendResult.message}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

