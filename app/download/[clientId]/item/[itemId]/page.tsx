import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getDeploymentRegion } from "@/config";
import { readDemoManifest } from "@/lib/demo-bundle";
import { resolveDemoPreview } from "@/lib/demo-preview";

type DemoLocale = "zh" | "en";

function resolveRequestOrigin(hostValue: string | null, protoValue: string | null) {
  const host = String(hostValue || "").split(",")[0]?.trim();
  const proto = String(protoValue || "").split(",")[0]?.trim().toLowerCase();

  if (!host) return "";

  try {
    return new URL(`${proto || "https"}://${host}`).origin;
  } catch {
    return "";
  }
}

export default async function ClientDownloadItemPage({
  params,
}: {
  params: Promise<{ clientId: string; itemId: string }> | { clientId: string; itemId: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const locale: DemoLocale = getDeploymentRegion() === "CN" ? "zh" : "en";
  const manifest = await readDemoManifest(resolvedParams.clientId);

  if (!manifest) {
    notFound();
  }

  const item = manifest.items.find((entry) => entry.id === resolvedParams.itemId);
  if (!item) {
    notFound();
  }

  const headerStore = await headers();
  const requestOrigin = resolveRequestOrigin(
    headerStore.get("x-forwarded-host") || headerStore.get("host"),
    headerStore.get("x-forwarded-proto"),
  );
  const preview = resolveDemoPreview(item, { preferredOrigin: requestOrigin });
  const isZh = locale === "zh";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center">
          <Link
            href={`/download/${encodeURIComponent(resolvedParams.clientId)}`}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {isZh ? "返回客户下载页" : "Back to client download"}
          </Link>
        </div>

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold md:text-3xl">{item.title}</h1>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
              <div className="mt-2 text-xs text-slate-500">{item.fileName}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(preview.mode === "inline" || preview.mode === "external") && preview.src && (
                <Link
                  href={preview.src}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  {isZh ? "打开预览" : "Open preview"}
                </Link>
              )}
              <a
                href={item.url}
                download={item.fileName}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                {isZh ? "下载文件" : "Download file"}
              </a>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          {item.kind === "video" && preview.src && (
            <video controls preload="metadata" className="w-full rounded-2xl border bg-black" src={preview.src} />
          )}

          {(preview.mode === "inline" || preview.mode === "external") &&
            (item.kind === "pdf" || item.kind === "html" || item.kind === "doc" || item.kind === "ppt") &&
            preview.src && <iframe title={item.title} src={preview.src} className="h-[78vh] w-full rounded-2xl border bg-white" />}

          {preview.mode === "none" && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-600">
              {isZh
                ? "当前文件暂时无法在线预览。你仍然可以直接下载文件，或在有公网 HTTPS 地址时使用外部预览。"
                : "This file is not previewable online right now. You can still download it directly or use an external preview when a public HTTPS URL is available."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
