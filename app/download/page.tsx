import Link from "next/link";
import { ArrowRight, Download, FolderOpen } from "lucide-react";
import { getDeploymentRegion } from "@/config";
import { listDemoClientBundles } from "@/lib/demo-bundle";

type DemoLocale = "zh" | "en";

function formatDate(value: string, locale: DemoLocale) {
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

export default async function DownloadIndexPage() {
  const locale: DemoLocale = getDeploymentRegion() === "CN" ? "zh" : "en";
  const isZh = locale === "zh";
  const clients = await listDemoClientBundles();

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
              <FolderOpen className="h-4 w-4" />
              /download
            </div>
            <div>
              <h1 className="text-2xl font-semibold md:text-3xl">
                {isZh ? "客户宣传包下载中心" : "Client bundle download center"}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {isZh
                  ? "这里集中展示所有已生成的客户宣传文件夹。每个客户都有独立下载页和独立 ZIP。"
                  : "This page lists all generated client promo folders. Each client has its own download page and ZIP bundle."}
              </p>
            </div>
          </div>
        </section>

        {!clients.length && (
          <section className="rounded-3xl border border-dashed bg-white px-6 py-12 text-center text-sm text-slate-600 shadow-sm">
            {isZh ? "当前还没有生成任何客户宣传包。" : "No client bundles have been generated yet."}
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          {clients.map((client) => (
            <article key={client.clientId} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{client.clientId}</div>
                  <div className="mt-1 text-xs text-slate-500">{client.basePath}</div>
                </div>
                <div className="rounded-full border px-3 py-1 text-xs font-medium text-slate-600">
                  {client.itemCount} files
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-600">
                {isZh ? "最近生成时间：" : "Last generated: "}
                {formatDate(client.generatedAt, locale)}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/download/${encodeURIComponent(client.clientId)}`}
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowRight className="h-4 w-4" />
                  {isZh ? "打开客户页" : "Open client page"}
                </Link>
                <a
                  href={`/api/demo/download/${encodeURIComponent(client.clientId)}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Download className="h-4 w-4" />
                  {isZh ? "下载 ZIP" : "Download ZIP"}
                </a>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
