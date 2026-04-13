import { getDeploymentRegion } from "@/config";
import AdminDemoPageClient from "./components/admin-demo-page-client";

export default function AdminPage() {
  const locale = getDeploymentRegion() === "CN" ? "zh" : "en";

  return <AdminDemoPageClient locale={locale} />;
}
