/**
 * 管理员登录页布局
 *
 * 使用独立布局，不显示侧边栏
 * 已登录用户的重定向由客户端页面组件处理
 */

export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 登录页使用独立布局，不显示侧边栏
  // 父 layout 会因为无会话而直接返回 children
  return <>{children}</>;
}
