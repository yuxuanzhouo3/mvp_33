import Link from "next/link";
import { Download, ExternalLink, FolderOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { getDeploymentRegion } from "@/config";
import { readDemoManifest } from "@/lib/demo-bundle";

type DemoLocale = "zh" | "en";

function getPreviewHref(clientId: string, itemId: string) {
  return `/download/${encodeURIComponent(clientId)}/item/${encodeURIComponent(itemId)}`;
}

function kindLabel(kind: string) {
  switch (kind) {
    case "doc":
      return "TXT";
    case "pdf":
      return "PDF";
    case "ppt":
      return "PPTX";
    case "video":
      return "VIDEO";
    default:
      return "HTML";
  }
}

export default async function ClientDownloadPage({
  params,
}: {
  params: Promise<{ clientId: string }> | { clientId: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const locale: DemoLocale = getDeploymentRegion() === "CN" ? "zh" : "en";
  const manifest = await readDemoManifest(resolvedParams.clientId);

  if (!manifest?.items.length) {
    notFound();
  }

  const isZh = locale === "zh";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
                <FolderOpen className="h-4 w-4" />
                {`/download/${resolvedParams.clientId}`}
              </div>
              <div>
                <h1 className="text-2xl font-semibold md:text-3xl">
                  {isZh ? `客户资料包 · ${resolvedParams.clientId}` : `Client bundle · ${resolvedParams.clientId}`}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  {isZh
                    ? `该客户的全部宣传文件已放在 ${manifest.basePath}，这里可以直接整包下载或逐个打开。`
                    : `All promo assets for this client are stored under ${manifest.basePath}. You can download the full bundle or open items individually here.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={`/api/demo/download/${encodeURIComponent(resolvedParams.clientId)}`}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                {isZh ? "下载客户 ZIP" : "Download client ZIP"}
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {manifest.items.map((item) => (
            <article key={item.id} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold">{item.title}</div>
                <div className="rounded-full border px-3 py-1 text-xs font-medium text-slate-600">{kindLabel(item.kind)}</div>
              </div>
              <div className="mt-2 text-sm text-slate-600">{item.description}</div>
              <div className="mt-2 text-xs text-slate-500">{item.fileName}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={getPreviewHref(resolvedParams.clientId, item.id)}
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  {isZh ? "打开预览" : "Open preview"}
                </Link>
                <a
                  href={item.url}
                  download={item.fileName}
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  {isZh ? "下载文件" : "Download file"}
                </a>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
