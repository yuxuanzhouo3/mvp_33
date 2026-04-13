"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { Copy, ExternalLink } from "lucide-react"

export default function MarketingInviteLandingPage() {
  const params = useParams<{ code: string }>()
  const searchParams = useSearchParams()
  const [notice, setNotice] = useState("")

  const code = String(params?.code || "").trim().toUpperCase()
  const campaign = String(searchParams.get("campaign") || "").trim()
  const product = String(searchParams.get("product") || "").trim()
  const tier = String(searchParams.get("tier") || "").trim()

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return window.location.href
  }, [])

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(label)
      window.setTimeout(() => setNotice(""), 1800)
    } catch {
      setNotice("Copy failed, please copy manually.")
      window.setTimeout(() => setNotice(""), 1800)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff,_#f8fafc_45%,_#ffffff)] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        {notice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

        <div className="rounded-[32px] border border-slate-200 bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            OrbitChat Invite
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Invite Code</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
            You received an OrbitChat partnership invite. Save the invite code below and use it during the next registration or partnership flow.
          </p>

          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Invite Code</div>
            <div className="mt-3 break-all text-2xl font-semibold tracking-[0.16em] text-slate-950 sm:text-3xl">{code || "-"}</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white bg-white px-4 py-3">
                <div className="text-xs text-slate-400">Campaign</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{campaign || "Not set"}</div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-4 py-3">
                <div className="text-xs text-slate-400">Product</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{product || "orbitchat"}</div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-4 py-3">
                <div className="text-xs text-slate-400">Tier</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{tier || "general"}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white"
              onClick={() => void copyText(code, "Invite code copied.")}
            >
              <span className="flex items-center gap-2"><Copy className="h-4 w-4" />Copy invite code</span>
            </button>
            <button
              type="button"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700"
              onClick={() => void copyText(shareUrl, "Invite link copied.")}
            >
              <span className="flex items-center gap-2"><Copy className="h-4 w-4" />Copy invite link</span>
            </button>
            <Link
              href="/login"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700"
            >
              <span className="flex items-center gap-2"><ExternalLink className="h-4 w-4" />Open login page</span>
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">
            This page is a lightweight landing page for QR and share links. It keeps the invite code, campaign, and product visible so the recipient can copy the code and continue in OrbitChat.
          </div>
        </div>
      </div>
    </main>
  )
}
