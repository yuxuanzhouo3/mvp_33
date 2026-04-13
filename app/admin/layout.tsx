import { ReactNode } from "react";
import { getDeploymentRegion } from "@/config";
import { Toaster } from "@/components/ui/sonner";
import { getAdminSession } from "@/lib/admin/session";
import AdminSidebar from "./components/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = getDeploymentRegion() === "CN" ? "zh" : "en";
  const sessionResult = await getAdminSession();

  if (!sessionResult.valid || !sessionResult.session) {
    return <>{children}</>;
  }

  const session = sessionResult.session;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="flex">
        <AdminSidebar locale={locale} username={session.username} role={session.role} />

        <main className="ml-64 flex-1 p-8">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
