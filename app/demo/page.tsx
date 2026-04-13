import Link from "next/link";
import { ArrowRight, ArrowUpRight, Download, FolderOpen, PackageOpen } from "lucide-react";
import { getDeploymentRegion } from "@/config";
import { listDemoClientBundles, readDemoManifest, type DemoManifestItem } from "@/lib/demo-bundle";

type DemoLocale = "zh" | "en";

function formatDate(value: string, locale: DemoLocale) {
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
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

function getPreviewHref(itemId: string) {
  return `/demo/item/${encodeURIComponent(itemId)}`;
}

function getCopy(locale: DemoLocale) {
  if (locale === "zh") {
    return {
      badge: "/demo",
      title: "宣传文件夹总览",
      description: "这里集中展示所有已生成的客户宣传文件夹。每个客户资料包实际写入 public/download/{clientId}，本页负责统一浏览入口。",
      openDownloadHub: "打开 /download",
      downloadLatestZip: "下载最新资料 ZIP",
      folderSectionTitle: "客户宣传文件夹",
      folderSectionDescription: "一个客户一个文件夹，可分别打开、预览和打包下载。",
      noFolders: "当前还没有客户宣传文件夹，先去后台生成一份。",
      latestSectionTitle: "最新预览资料镜像",
      latestSectionDescription: "这里保留最新一次生成的默认预览包，方便市场分发页和 /demo/item 继续直接读取。",
      noLatest: "当前还没有可直接预览的最新资料镜像。",
      filesLabel: "文件数",
      updatedLabel: "最近生成",
      openFolder: "打开文件夹",
      downloadZip: "下载 ZIP",
      openPreview: "打开预览",
      downloadFile: "下载文件",
      warnings: "生成提示",
      emptyTitle: "当前还没有任何宣传资料",
      emptyDescription: "请先到 /admin 生成客户宣传文件夹。",
    } as const;
  }

  return {
    badge: "/demo",
    title: "Promo Folder Overview",
    description: "This page lists all generated client promo folders. Each client bundle is written to public/download/{clientId}, while /demo stays the unified browsing entry.",
    openDownloadHub: "Open /download",
    downloadLatestZip: "Download latest ZIP",
    folderSectionTitle: "Client promo folders",
    folderSectionDescription: "One folder per client, each with its own preview page and ZIP package.",
    noFolders: "No client promo folders have been generated yet.",
    latestSectionTitle: "Latest preview mirror",
    latestSectionDescription: "The newest generated bundle is mirrored here so existing /demo/item flows keep working.",
    noLatest: "There is no preview mirror available yet.",
    filesLabel: "Files",
    updatedLabel: "Last generated",
    openFolder: "Open folder",
    downloadZip: "Download ZIP",
    openPreview: "Open preview",
    downloadFile: "Download file",
    warnings: "Warnings",
    emptyTitle: "No promo assets yet",
    emptyDescription: "Generate a client promo folder from /admin first.",
  } as const;
}

export default async function DemoPage() {
  const locale: DemoLocale = getDeploymentRegion() === "CN" ? "zh" : "en";
  const copy = getCopy(locale);
  const [clientBundles, latestManifest] = await Promise.all([listDemoClientBundles(), readDemoManifest()]);
  const latestItems = latestManifest?.items || [];

  return (
    <main className="min-h-screen bg-[#f5efe6] px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[32px] border border-black/5 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-sm font-medium text-white">
                <FolderOpen className="h-4 w-4" />
                {copy.badge}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{copy.title}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">{copy.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/download"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <ArrowRight className="h-4 w-4" />
                {copy.openDownloadHub}
              </Link>
              {!!latestItems.length && (
                <a
                  href="/api/demo/download"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  <Download className="h-4 w-4" />
                  {copy.downloadLatestZip}
                </a>
              )}
            </div>
          </div>
        </section>

        {!clientBundles.length && !latestItems.length && (
          <section className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center shadow-sm">
            <h2 className="text-xl font-semibold">{copy.emptyTitle}</h2>
            <p className="mt-3 text-sm text-slate-600">{copy.emptyDescription}</p>
          </section>
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">{copy.folderSectionTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{copy.folderSectionDescription}</p>
          </div>

          {!clientBundles.length && (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-sm text-slate-600 shadow-sm">
              {copy.noFolders}
            </div>
          )}

          {!!clientBundles.length && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {clientBundles.map((bundle) => (
                <article
                  key={bundle.clientId}
                  className="rounded-[28px] border border-black/5 bg-white/80 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                      {bundle.clientId}
                    </div>
                    <div className="text-xs text-slate-500">
                      {copy.filesLabel}: {bundle.itemCount}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="text-sm font-medium text-slate-900">{bundle.basePath}</div>
                    <div className="text-sm text-slate-600">
                      {copy.updatedLabel}: {formatDate(bundle.generatedAt, locale)}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={`/download/${encodeURIComponent(bundle.clientId)}`}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      {copy.openFolder}
                    </Link>
                    <a
                      href={`/api/demo/download/${encodeURIComponent(bundle.clientId)}`}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      <Download className="h-4 w-4" />
                      {copy.downloadZip}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">{copy.latestSectionTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{copy.latestSectionDescription}</p>
          </div>

          {!latestItems.length && (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-sm text-slate-600 shadow-sm">
              {copy.noLatest}
            </div>
          )}

          {!!latestItems.length && (
            <div className="grid gap-4 md:grid-cols-2">
              {latestItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[28px] border border-black/5 bg-white/80 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                      {kindLabel(item.kind, locale)}
                    </div>
                    {item.fallback && (
                      <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Fallback</div>
                    )}
                  </div>

                  <h3 className="mt-5 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                  <div className="mt-3 text-xs text-slate-500">{item.fileName}</div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={getPreviewHref(item.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      <PackageOpen className="h-4 w-4" />
                      {copy.openPreview}
                    </Link>
                    <a
                      href={item.url}
                      download={item.fileName}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      <Download className="h-4 w-4" />
                      {copy.downloadFile}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {!!latestManifest?.warnings?.length && (
          <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-6 py-5">
            <h2 className="text-lg font-semibold text-amber-800">{copy.warnings}</h2>
            <div className="mt-3 space-y-2 text-sm text-amber-700">
              {latestManifest.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
