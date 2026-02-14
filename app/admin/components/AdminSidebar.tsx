"use client";

/**
 * 管理后台侧边栏组件
 *
 * 基于 shadcn/ui 和 Lucide React 图标
 * 包含导航菜单和用户信息
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminLogoutAction } from "@/actions/admin-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  CreditCard,
  Image,
  FolderOpen,
  Settings,
  LogOut,
  User,
  Package,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  username: string;
  role: "admin" | "super_admin";
}

/**
 * 导航菜单项
 */
const navItems = [
  {
    href: "/admin/dashboard",
    label: "数据统计",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/payments",
    label: "支付记录",
    icon: CreditCard,
  },
  {
    href: "/admin/ads",
    label: "广告管理",
    icon: Image,
  },
  {
    href: "/admin/social-links",
    label: "社交链接",
    icon: LinkIcon,
  },
  {
    href: "/admin/releases",
    label: "发布版本",
    icon: Package,
  },
  {
    href: "/admin/files",
    label: "文件管理",
    icon: FolderOpen,
  },
  {
    href: "/admin/settings",
    label: "系统设置",
    icon: Settings,
  },
];

export default function AdminSidebar({ username, role }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
      {/* Logo / 标题 */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">管理后台</span>
        </Link>
        {/* 角色标识 */}
        <div className="mt-2">
          <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
            {role === "super_admin" ? "超级管理员" : "管理员"}
          </span>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 用户信息和登出 */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3 px-4 py-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{username}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {role === "super_admin" ? "超级管理员" : "管理员"}
            </p>
          </div>
        </div>

        <form action={adminLogoutAction}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <LogOut className="h-4 w-4 mr-2" />
            退出登录
          </Button>
        </form>
      </div>
    </aside>
  );
}
