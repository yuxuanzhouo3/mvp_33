"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Blocks,
  CreditCard,
  FileStack,
  FolderOpen,
  Image,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Package,
  Settings,
  Sparkles,
  Tag,
  User,
  PieChart,
} from "lucide-react";
import { adminLogoutAction } from "@/actions/admin-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  locale: "zh" | "en";
  username: string;
  role: "admin" | "super_admin";
}

const navItems = [
  { href: "/admin/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/admin/system-hub", key: "systemHub", icon: Blocks },
  { href: "/admin/payments", key: "payments", icon: CreditCard },
  { href: "/admin/coupons", key: "coupons", icon: Tag },
  { href: "/admin/reports", key: "reports", icon: AlertTriangle },
  { href: "/admin/ads", key: "ads", icon: Image },
  { href: "/admin/social-links", key: "socialLinks", icon: LinkIcon },
  { href: "/admin/releases", key: "releases", icon: Package },
  { href: "/admin/files", key: "files", icon: FolderOpen },
  { href: "/admin/analysis", key: "analysis", icon: PieChart },
  { href: "/admin/ai-studio", key: "aiStudio", icon: Sparkles },
  { href: "/admin", key: "demo", icon: FileStack, exact: true },
  { href: "/admin/settings", key: "settings", icon: Settings },
] as const;

const copy = {
  zh: {
    brand: "管理后台",
    demo: "宣传资料",
    dashboard: "仪表盘",
    payments: "支付",
    coupons: "优惠券",
    reports: "报表",
    ads: "广告",
    socialLinks: "社交链接",
    releases: "版本发布",
    analysis: "用户分析",
    files: "文件",
    aiStudio: "AI 工作台",
    settings: "设置",
    roleAdmin: "管理员",
    roleSuperAdmin: "超级管理员",
    logout: "退出登录",
  },
  en: {
    brand: "Admin Console",
    demo: "Demo Bundle",
    dashboard: "Dashboard",
    payments: "Payments",
    coupons: "Coupons",
    reports: "Reports",
    ads: "Ads",
    socialLinks: "Social Links",
    releases: "Releases",
    analysis: "User Analysis",
    files: "Files",
    aiStudio: "AI Studio",
    settings: "Settings",
    roleAdmin: "Admin",
    roleSuperAdmin: "Super Admin",
    logout: "Log out",
  },
} as const;

export default function AdminSidebar({ locale, username, role }: AdminSidebarProps) {
  const pathname = usePathname();
  const t = copy[locale];
  const roleLabel = role === "super_admin" ? t.roleSuperAdmin : t.roleAdmin;

  return (
    <aside className="fixed left-0 top-0 flex h-full w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-slate-200 p-6 dark:border-slate-700">
        <Link href="/admin" className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">{t.brand}</span>
        </Link>
        <div className="mt-2">
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{roleLabel}</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{t[item.key] || (item.key === "systemHub" ? (locale === "zh" ? "系统总览" : "System Hub") : item.key)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-700">
        <div className="mb-2 flex items-center gap-3 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{username}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel}</p>
          </div>
        </div>

        <form action={adminLogoutAction}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start text-slate-600 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t.logout}
          </Button>
        </form>
      </div>
    </aside>
  );
}
