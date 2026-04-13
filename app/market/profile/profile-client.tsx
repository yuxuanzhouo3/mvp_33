"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  Globe,
  Mail,
  Save,
  Server,
  Shield,
  User,
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

function SmtpSection({
  title,
  description,
  email,
  password,
  showPassword,
  saving,
  configured,
  emailPlaceholder,
  passwordHint,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onSave,
}: {
  title: string
  description: string
  email: string
  password: string
  showPassword: boolean
  saving: boolean
  configured: boolean
  emailPlaceholder: string
  passwordHint: string
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
  onSave: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5 text-orange-500" />
          <span>{title}</span>
          {configured ? <Badge className="ml-1">Configured</Badge> : <Badge variant="secondary">Pending</Badge>}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder={emailPlaceholder} />
        </div>

        <div className="space-y-2">
          <Label>Password / App Password</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Only fill this when you want to update the password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              onClick={onTogglePassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{passwordHint}</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save SMTP"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProfileClient() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toastMessage, setToastMessage] = useState("")

  const [cnEmail, setCnEmail] = useState("")
  const [cnPass, setCnPass] = useState("")
  const [cnShowPass, setCnShowPass] = useState(false)
  const [cnSaving, setCnSaving] = useState(false)

  const [intlEmail, setIntlEmail] = useState("")
  const [intlPass, setIntlPass] = useState("")
  const [intlShowPass, setIntlShowPass] = useState(false)
  const [intlSaving, setIntlSaving] = useState(false)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(""), 3000)
  }, [])

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/market-admin/admin/profile", {
        headers: getAuthHeaders(),
        cache: "no-store",
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success || !json?.profile) {
        throw new Error(json?.error || "Failed to load profile settings")
      }

      const nextProfile = json.profile as ProfileData
      setProfile(nextProfile)
      setCnEmail(nextProfile.smtp.cn_user || "")
      setIntlEmail(nextProfile.smtp.intl_user || "")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load profile settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  const handleSaveSmtp = useCallback(
    async (target: "cn" | "intl") => {
      const user = target === "cn" ? cnEmail.trim() : intlEmail.trim()
      const pass = target === "cn" ? cnPass.trim() : intlPass.trim()
      const setSaving = target === "cn" ? setCnSaving : setIntlSaving

      if (!user) {
        showToast("Please enter an SMTP email address first.")
        return
      }

      setSaving(true)
      try {
        const response = await fetch("/api/market-admin/admin/profile", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ action: "update_smtp", target, user, pass }),
        })
        const json = await response.json().catch(() => null)
        if (!response.ok || !json?.success) {
          throw new Error(json?.error || "Failed to save SMTP settings")
        }

        showToast(json?.message || `${target.toUpperCase()} SMTP saved`)
        if (target === "cn") {
          setCnPass("")
        } else {
          setIntlPass("")
        }
        await fetchProfile()
      } catch (nextError) {
        showToast(nextError instanceof Error ? nextError.message : "Failed to save SMTP settings")
      } finally {
        setSaving(false)
      }
    },
    [cnEmail, cnPass, fetchProfile, intlEmail, intlPass, showToast],
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/20 px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/20 px-4 py-8">
        <div className="mx-auto max-w-3xl py-20 text-center">
          <p className="mb-4 text-destructive">{error}</p>
          <Button onClick={() => void fetchProfile()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2 text-muted-foreground">
              <Link href="/market">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back to market console
              </Link>
            </Button>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <span className="rounded-lg bg-violet-100 p-2 text-violet-600">
                <User className="h-5 w-5" />
              </span>
              SMTP Profile Settings
            </h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <span>Admin Profile</span>
            </CardTitle>
            <CardDescription>Review the current operator and deployment region before updating outbound mail settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Username</Label>
              <p className="text-lg font-medium">{profile?.username || "admin"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Region</Label>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <Badge variant={profile?.region === "CN" ? "default" : "secondary"}>{profile?.region || "Unknown"}</Badge>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">SMTP Mode</Label>
              <Badge variant="outline">
                <Mail className="mr-1 h-3.5 w-3.5" />
                Runtime overrides
              </Badge>
            </div>
          </CardContent>
        </Card>

        <SmtpSection
          title="China SMTP"
          description="Used by CN-region notifications and outbound market emails."
          email={cnEmail}
          password={cnPass}
          showPassword={cnShowPass}
          saving={cnSaving}
          configured={Boolean(profile?.smtp.cn_configured)}
          emailPlaceholder="team@example.cn"
          passwordHint="If your provider uses an app password, paste it here. Leave blank to keep the current password."
          onEmailChange={setCnEmail}
          onPasswordChange={setCnPass}
          onTogglePassword={() => setCnShowPass((value) => !value)}
          onSave={() => void handleSaveSmtp("cn")}
        />

        <SmtpSection
          title="International SMTP"
          description="Used by INTL-region notifications and outbound market emails."
          email={intlEmail}
          password={intlPass}
          showPassword={intlShowPass}
          saving={intlSaving}
          configured={Boolean(profile?.smtp.intl_configured)}
          emailPlaceholder="team@example.com"
          passwordHint="For Gmail or similar providers, use an app password if normal passwords are blocked."
          onEmailChange={setIntlEmail}
          onPasswordChange={setIntlPass}
          onTogglePassword={() => setIntlShowPass((value) => !value)}
          onSave={() => void handleSaveSmtp("intl")}
        />

        <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
          Runtime overrides are kept in memory for the current server process. Environment values in `.env.local` are still the long-term fallback.
        </div>

        {toastMessage ? (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm text-background shadow-lg">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
