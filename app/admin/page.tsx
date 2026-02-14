/**
 * 管理后台首页
 *
 * 重定向到仪表板
 */

import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/dashboard");
}
