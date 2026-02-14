/**
 * 管理后台布局
 *
 * 为所有管理后台页面提供统一的布局
 * 包含侧边栏和主内容区
 * 不使用用户端认证 Provider（Supabase/CloudBase）
 */

import { getAdminSession } from "@/lib/admin/session";
import AdminSidebar from "./components/AdminSidebar";
import { Toaster } from "@/components/ui/sonner";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 获取管理员会话
  // 中间件已经处理了认证重定向，这里只需要获取会话信息用于显示
  const sessionResult = await getAdminSession();

  // 如果没有会话（被中间件放行的登录页），直接渲染 children
  if (!sessionResult.valid || !sessionResult.session) {
    return <>{children}</>;
  }

  const session = sessionResult.session;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="flex">
        {/* 侧边栏 */}
        <AdminSidebar
          username={session.username}
          role={session.role}
        />

        {/* 主内容区 */}
        <main className="flex-1 ml-64 p-8">
          {children}
        </main>
      </div>
      {/* 管理后台使用独立的 Toaster，不依赖用户端认证 */}
      <Toaster />
    </div>
  );
}
