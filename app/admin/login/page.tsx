"use client";

/**
 * 管理员登录页面
 *
 * 基于 shadcn/ui 组件库设计
 * 支持表单验证和错误提示
 * 已登录用户会自动重定向到仪表板
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminLoginAction } from "@/actions/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, User } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // 检查用户是否已登录，如果已登录则重定向
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/admin/check-auth", {
          credentials: "include",
        });
        if (res.ok) {
          // 已登录，重定向到仪表板
          router.replace("/admin/dashboard");
          return;
        }
      } catch (err) {
        // 忽略错误，继续显示登录表单
      } finally {
        setChecking(false);
      }
    }
    checkAuth();
  }, [router]);

  // 正在检查会话，显示加载状态
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await adminLoginAction(formData);

    if (result.success) {
      // 登录成功，跳转到仪表板
      router.push("/admin/dashboard");
      router.refresh();
    } else {
      setError(result.error || "登录失败");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">管理后台</CardTitle>
          <CardDescription>请输入管理员账号密码登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 错误提示 */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* 用户名输入 */}
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="请输入用户名"
                  className="pl-10"
                  required
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>

            {/* 密码输入 */}
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="请输入密码"
                  className="pl-10"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* 登录按钮 */}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  登录中...
                </>
              ) : (
                "登录"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
