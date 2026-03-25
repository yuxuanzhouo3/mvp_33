"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  User, Mail, Shield, ChevronLeft, Save, Eye, EyeOff,
  CheckCircle, Server, Globe,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"

interface ProfileData {
  username: string
  region: string
  smtp: {
    cn_user: string
    cn_configured: boolean
    intl_user: string
    intl_configured: boolean
  }
}

function getAuthHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-admin-key": "orbitchat-admin",
  }
}

export function ProfileClient() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toastMessage, setToastMessage] = useState("")

  // CN SMTP form
  const [cnEmail, setCnEmail] = useState("")
  const [cnPass, setCnPass] = useState("")
  const [cnShowPass, setCnShowPass] = useState(false)
  const [cnSaving, setCnSaving] = useState(false)

  // INTL SMTP form
  const [intlEmail, setIntlEmail] = useState("")
  const [intlPass, setIntlPass] = useState("")
  const [intlShowPass, setIntlShowPass] = useState(false)
  const [intlSaving, setIntlSaving] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(""), 3000)
  }, [])

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/market/admin/profile", { headers: getAuthHeaders() })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "加载失败")
      const p: ProfileData = json.profile
      setProfile(p)
      setCnEmail(p.smtp.cn_user)
      setIntlEmail(p.smtp.intl_user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const handleSaveSmtp = useCallback(async (target: "cn" | "intl") => {
    const user = target === "cn" ? cnEmail : intlEmail
    const pass = target === "cn" ? cnPass : intlPass
    const setSaving = target === "cn" ? setCnSaving : setIntlSaving

    if (!user.trim()) {
      showToast("❌ 邮箱地址不能为空")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/market/admin/profile", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: "update_smtp", target, user, pass }),
      })
      const json = await res.json()
      if (json.success) {
        showToast(`✅ ${target.toUpperCase()} 发件邮箱已更新`)
        if (target === "cn") setCnPass("")
        else setIntlPass("")
        await fetchProfile()
      } else {
        showToast(`❌ ${json.error || "保存失败"}`)
      }
    } catch (err) {
      showToast(`❌ ${err instanceof Error ? err.message : "网络错误"}`)
    } finally {
      setSaving(false)
    }
  }, [cnEmail, cnPass, intlEmail, intlPass, showToast, fetchProfile])

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/20 px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/20 px-4 py-8">
        <div className="mx-auto max-w-3xl text-center py-20">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={fetchProfile}>重试</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3 text-muted-foreground">
              <Link href="/market"><ChevronLeft className="mr-1 h-4 w-4" /> 返回系统导航</Link>
            </Button>
            <h1 className="text-2xl font-bold flex items-center space-x-2">
              <span className="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400 p-2 rounded-lg">
                <User className="h-6 w-6" />
              </span>
              <span>个人中心</span>
            </h1>
          </div>
        </div>

        {/* Admin Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <span>管理员信息</span>
            </CardTitle>
            <CardDescription>当前登录的管理员账户信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">用户名</Label>
                <p className="font-medium text-lg">{profile?.username || "admin"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">当前部署区域</Label>
                <div className="flex items-center space-x-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <Badge variant={profile?.region === "CN" ? "default" : "secondary"}>
                    {profile?.region === "CN" ? "🇨🇳 中国大陆" : "🌍 国际版"}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">权限角色</Label>
                <Badge variant="outline">市场管理员</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CN SMTP Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Server className="h-5 w-5 text-orange-500" />
              <span>国内发件邮箱 (CN)</span>
              {profile?.smtp.cn_configured && <Badge variant="default" className="ml-2">已配置</Badge>}
            </CardTitle>
            <CardDescription>用于中国大陆环境下发送邮件，默认使用新浪邮箱 SMTP</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>发件邮箱地址</Label>
              <Input
                type="email"
                value={cnEmail}
                onChange={(e) => setCnEmail(e.target.value)}
                placeholder="如: team@sina.cn"
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱密码 / 授权码</Label>
              <div className="relative">
                <Input
                  type={cnShowPass ? "text" : "password"}
                  value={cnPass}
                  onChange={(e) => setCnPass(e.target.value)}
                  placeholder="留空表示不修改"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setCnShowPass(!cnShowPass)}
                >
                  {cnShowPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">新浪邮箱可能需要在邮箱设置中开启 SMTP 服务并获取授权码</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => handleSaveSmtp("cn")} disabled={cnSaving}>
                <Save className="mr-2 h-4 w-4" /> {cnSaving ? "保存中..." : "保存国内邮箱设置"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* INTL SMTP Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Globe className="h-5 w-5 text-blue-500" />
              <span>国际发件邮箱 (INTL)</span>
              {profile?.smtp.intl_configured && <Badge variant="default" className="ml-2">已配置</Badge>}
            </CardTitle>
            <CardDescription>用于国际版环境下发送邮件，默认使用 Gmail SMTP</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>发件邮箱地址</Label>
              <Input
                type="email"
                value={intlEmail}
                onChange={(e) => setIntlEmail(e.target.value)}
                placeholder="如: team@gmail.com"
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱密码 / 应用专用密码</Label>
              <div className="relative">
                <Input
                  type={intlShowPass ? "text" : "password"}
                  value={intlPass}
                  onChange={(e) => setIntlPass(e.target.value)}
                  placeholder="留空表示不修改"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setIntlShowPass(!intlShowPass)}
                >
                  {intlShowPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">⚠️ Gmail 需要应用专用密码</p>
                <p>登录 Google 账号 → 安全性 → 两步验证（先开启）→ 应用专用密码 → 生成 16 位密码。</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => handleSaveSmtp("intl")} disabled={intlSaving}>
                <Save className="mr-2 h-4 w-4" /> {intlSaving ? "保存中..." : "保存国际邮箱设置"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info note */}
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p>💡 在个人中心修改的邮箱设置会立即生效，不需要重启服务。但服务重启后会恢复为环境变量中的默认值。如需永久修改，请直接编辑 <code className="bg-muted px-1 rounded">.env.local</code> 文件。</p>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-foreground text-background px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 z-50 animate-in slide-in-from-bottom-5">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm">{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
