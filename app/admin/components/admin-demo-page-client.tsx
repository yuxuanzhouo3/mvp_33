"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  FileStack,
  FolderOpen,
  FolderSync,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { generateAdminDemoBundle, getAdminDemoManifest, listAdminDemoBundles } from "@/actions/admin-demo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DemoClientBundleSummary, DemoManifest, DemoManifestItem } from "@/lib/demo-bundle";

type DemoLocale = "zh" | "en";

function normalizeClientIdInput(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function kindLabel(kind: DemoManifestItem["kind"], locale: DemoLocale) {
  switch (kind) {
    case "doc":
      return "TXT";
    case "pdf":
      return "PDF";
    case "ppt":
      return "PPTX";
    case "video":
      return locale === "zh" ? "视频" : "VIDEO";
    default:
      return "HTML";
  }
}

function formatDate(value: string, locale: DemoLocale) {
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

function getPreviewHref(clientId: string, itemId: string) {
  return `/download/${encodeURIComponent(clientId)}/item/${encodeURIComponent(itemId)}`;
}

function getCopy(locale: DemoLocale) {
  if (locale === "zh") {
    return {
      badge: "宣传资料中心",
      title: "生成多个客户宣传文件夹",
      description: "每次生成都会写入独立客户文件夹 /download/{clientId}，同时自动同步最新一份预览镜像到 /demo。",
      inputLabel: "客户文件夹名",
      inputPlaceholder: "例如：acme、bytedance、partner-a",
      clientIdHint: "只保留英文字母、数字、中划线和下划线。",
      generateButton: "生成当前客户资料夹",
      openDemoButton: "打开 /demo 总览",
      openFolderButton: "打开当前文件夹",
      outputPathLabel: "当前输出路径",
      outputPathDescription: "真实文件写入 public/download/{clientId}；/demo 只负责统一展示入口。",
      bundlesLabel: "已生成客户",
      bundlesDescription: "点击下方客户名可切换查看该客户资料包。",
      noBundles: "当前还没有客户宣传文件夹。",
      statusTitle: "当前客户资料状态",
      statusEmpty: "先输入客户文件夹名并生成一份资料包。",
      draftLabel: "当前输入",
      draftEmpty: "这个客户文件夹还没有生成，点击上方按钮后就会写入该路径。",
      latestGenerated: "最近生成时间：",
      downloadZip: "下载当前 ZIP",
      downloadFile: "下载文件",
      openPreview: "打开预览",
      fallback: "回退文件",
      warnings: "生成提示",
      generateSuccess: (clientId: string) => `已生成客户资料夹：/download/${clientId}，并同步到 /demo。`,
      clientIdRequired: "请先填写客户文件夹名。",
      loadError: "读取客户资料失败，请稍后重试。",
      generateError: "生成客户资料失败，请稍后重试。",
      selectLabel: "当前客户",
      syncHint: "最新一次生成的客户资料会自动作为 /demo 的默认预览镜像。",
    } as const;
  }

  return {
    badge: "Demo Bundle Studio",
    title: "Generate multiple client promo folders",
    description: "Each run writes a dedicated client folder to /download/{clientId} and mirrors the newest bundle to /demo for preview flows.",
    inputLabel: "Client folder name",
    inputPlaceholder: "For example: acme, bytedance, partner-a",
    clientIdHint: "Only letters, numbers, dashes, and underscores are kept.",
    generateButton: "Generate client folder",
    openDemoButton: "Open /demo overview",
    openFolderButton: "Open current folder",
    outputPathLabel: "Current output path",
    outputPathDescription: "Files are written to public/download/{clientId}; /demo stays the unified browsing entry.",
    bundlesLabel: "Generated clients",
    bundlesDescription: "Click a client below to switch the preview to that bundle.",
    noBundles: "No client promo folders have been generated yet.",
    statusTitle: "Current client bundle status",
    statusEmpty: "Enter a client folder name and generate a bundle first.",
    draftLabel: "Current input",
    draftEmpty: "This client folder has not been generated yet. Click generate and files will be written into this path.",
    latestGenerated: "Last generated: ",
    downloadZip: "Download current ZIP",
    downloadFile: "Download file",
    openPreview: "Open preview",
    fallback: "Fallback",
    warnings: "Warnings",
    generateSuccess: (clientId: string) => `Generated /download/${clientId} and synced the newest preview to /demo.`,
    clientIdRequired: "Enter a client folder name first.",
    loadError: "Failed to read client bundle data.",
    generateError: "Failed to generate the client bundle.",
    selectLabel: "Current client",
    syncHint: "The most recently generated client bundle becomes the default /demo preview mirror.",
  } as const;
}

export default function AdminDemoPageClient({ locale }: { locale: DemoLocale }) {
  const copy = getCopy(locale);
  const [clientIdInput, setClientIdInput] = useState("acme");
  const [bundles, setBundles] = useState<DemoClientBundleSummary[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<DemoManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const normalizedInputClientId = useMemo(() => normalizeClientIdInput(clientIdInput), [clientIdInput]);
  const matchedInputBundle = useMemo(
    () => (normalizedInputClientId ? bundles.find((bundle) => bundle.clientId === normalizedInputClientId) || null : null),
    [bundles, normalizedInputClientId],
  );
  const isDraftingNewClient = Boolean(normalizedInputClientId) && !matchedInputBundle;
  const displayedClientId = normalizedInputClientId || activeClientId;
  const displayedActiveClientId = matchedInputBundle?.clientId || (isDraftingNewClient ? null : activeClientId);
  const displayedManifest = displayedActiveClientId ? manifest : null;
  const currentFolderHref = displayedActiveClientId ? `/download/${encodeURIComponent(displayedActiveClientId)}` : null;
  const currentZipHref = displayedActiveClientId ? `/api/demo/download/${encodeURIComponent(displayedActiveClientId)}` : null;
  const renderedItems = displayedManifest?.items || [];
  const statusDescription = isDraftingNewClient
    ? `${copy.draftLabel}：${normalizedInputClientId}`
    : displayedActiveClientId
      ? `${copy.selectLabel}：${displayedActiveClientId}`
      : copy.statusEmpty;

  async function loadClientManifest(clientId: string) {
    const result = await getAdminDemoManifest(clientId);

    if (!result.success) {
      setError(result.error || copy.loadError);
      setManifest(null);
      return;
    }

    setActiveClientId(clientId);
    setManifest(result.manifest || null);
  }

  async function refreshBundleList(preferredClientId?: string | null) {
    const result = await listAdminDemoBundles();

    if (!result.success) {
      setError(result.error || copy.loadError);
      return;
    }

    const nextBundles = result.bundles || [];
    setBundles(nextBundles);

    const preferred = normalizeClientIdInput(preferredClientId || "") || nextBundles[0]?.clientId || null;
    if (!preferred) {
      setActiveClientId(null);
      setManifest(null);
      return;
    }

    await loadClientManifest(preferred);
  }

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await listAdminDemoBundles();
      if (cancelled) return;

      if (!result.success) {
        setError(result.error || copy.loadError);
        return;
      }

      const nextBundles = result.bundles || [];
      setBundles(nextBundles);

      const firstClientId = nextBundles[0]?.clientId || null;
      if (!firstClientId) {
        return;
      }

      setActiveClientId(firstClientId);
      setClientIdInput(firstClientId);

      const manifestResult = await getAdminDemoManifest(firstClientId);
      if (cancelled) return;

      if (!manifestResult.success) {
        setError(manifestResult.error || copy.loadError);
        return;
      }

      setManifest(manifestResult.manifest || null);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [copy.loadError]);

  useEffect(() => {
    if (!matchedInputBundle) return;
    if (matchedInputBundle.clientId === activeClientId) return;
    void loadClientManifest(matchedInputBundle.clientId);
  }, [matchedInputBundle, activeClientId]);

  function handleGenerate() {
    if (!normalizedInputClientId) {
      setError(copy.clientIdRequired);
      setMessage(null);
      return;
    }

    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await generateAdminDemoBundle(normalizedInputClientId);
      if (!result.success) {
        setError(result.error || copy.generateError);
        return;
      }

      setClientIdInput(normalizedInputClientId);
      setActiveClientId(normalizedInputClientId);
      setManifest(result.manifest || null);
      setMessage(copy.generateSuccess(normalizedInputClientId));
      await refreshBundleList(normalizedInputClientId);
    });
  }

  function handleSelectClient(clientId: string) {
    setClientIdInput(clientId);
    setError(null);
    setMessage(null);

    startTransition(async () => {
      await loadClientManifest(clientId);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
              <Sparkles className="h-4 w-4" />
              {copy.badge}
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">{copy.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{copy.description}</p>
            </div>
          </div>

          <div className="flex w-full max-w-xl flex-col gap-3 lg:items-end">
            <div className="w-full space-y-2">
              <div className="text-sm font-medium text-slate-700">{copy.inputLabel}</div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={clientIdInput}
                  onChange={(event) => setClientIdInput(event.target.value)}
                  placeholder={copy.inputPlaceholder}
                  className="h-11"
                  disabled={isPending}
                />
                <Button onClick={handleGenerate} disabled={isPending} className="h-11 px-5">
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderSync className="mr-2 h-4 w-4" />}
                  {copy.generateButton}
                </Button>
              </div>
              <div className="text-xs text-slate-500">{copy.clientIdHint}</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" className="h-11 px-5">
                <Link href="/demo" target="_blank">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {copy.openDemoButton}
                </Link>
              </Button>
              {currentFolderHref && (
                <Button asChild variant="outline" className="h-11 px-5">
                  <Link href={currentFolderHref} target="_blank">
                    <FolderOpen className="mr-2 h-4 w-4" />
                    {copy.openFolderButton}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-rose-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {message && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 text-sm text-emerald-700">{message}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{copy.outputPathLabel}</CardDescription>
            <CardTitle className="font-mono text-xl">
              {displayedClientId ? `/download/${displayedClientId}` : "/download/{clientId}"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <div>{copy.outputPathDescription}</div>
            <div>{copy.syncHint}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{copy.bundlesLabel}</CardDescription>
            <CardTitle>{bundles.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-600">{copy.bundlesDescription}</div>
            {!bundles.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                {copy.noBundles}
              </div>
            )}
            {!!bundles.length && (
              <div className="flex flex-wrap gap-2">
                {bundles.map((bundle) => {
                  const isActive = bundle.clientId === displayedActiveClientId;

                  return (
                    <button
                      key={bundle.clientId}
                      type="button"
                      onClick={() => handleSelectClient(bundle.clientId)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {bundle.clientId}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="h-5 w-5 text-slate-500" />
            {copy.statusTitle}
          </CardTitle>
          <CardDescription>{statusDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {displayedManifest?.generatedAt && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-600">
                {copy.latestGenerated}
                {formatDate(displayedManifest.generatedAt, locale)}
              </div>
              <div className="flex flex-wrap gap-3">
                {currentFolderHref && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={currentFolderHref} target="_blank">
                      <ArrowUpRight className="mr-2 h-4 w-4" />
                      {copy.openFolderButton}
                    </Link>
                  </Button>
                )}
                {currentZipHref && (
                  <Button asChild size="sm">
                    <a href={currentZipHref}>
                      <Download className="mr-2 h-4 w-4" />
                      {copy.downloadZip}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {!renderedItems.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              {isDraftingNewClient ? copy.draftEmpty : copy.statusEmpty}
            </div>
          )}

          {!!renderedItems.length && (
            <div className="grid gap-3">
              {renderedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                        {kindLabel(item.kind, locale)}
                      </span>
                      {item.fallback && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          {copy.fallback}
                        </span>
                      )}
                      <span className="text-sm font-medium text-slate-900">{item.title}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                    <div className="mt-2 text-xs text-slate-500">{item.fileName}</div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {displayedActiveClientId && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={getPreviewHref(displayedActiveClientId, item.id)} target="_blank" rel="noreferrer">
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          {copy.openPreview}
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm">
                      <a href={item.url} download={item.fileName}>
                        <Download className="mr-2 h-4 w-4" />
                        {copy.downloadFile}
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!!displayedManifest?.warnings?.length && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 text-sm font-semibold text-amber-800">{copy.warnings}</div>
              <div className="space-y-2 text-sm text-amber-700">
                {displayedManifest.warnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
