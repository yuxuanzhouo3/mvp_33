"use client";

import { useState } from "react";
import { changePasswordAction } from "@/actions/admin-auth";
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
import { Loader2, Lock, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // 提前保存表单引用，避免异步操作后 null 引用

    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(form);
    const result = await changePasswordAction(formData);

    if (result.success) {
      setSuccess(true);
      // 清空表单
      form.reset();
    } else {
      setError(result.error || "修改失败");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理您的账户安全设置
        </p>
      </div>

      {/* 修改密码 */}
      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle>修改密码</CardTitle>
          </div>
          <CardDescription>
            定期修改密码可以提高账户安全性
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>密码修改成功！</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="currentPassword">当前密码</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                placeholder="请输入当前密码"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                placeholder="请输入新密码（至少6位）"
                minLength={6}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="请再次输入新密码"
                minLength={6}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  修改中...
                </>
              ) : (
                "修改密码"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 其他设置（可扩展） */}
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">关于</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong>系统版本：</strong> 1.0.0</p>
          <p><strong>数据库：</strong> Supabase (国际版) + CloudBase (国内版)</p>
          <p><strong>存储：</strong> 双端同步存储</p>
        </CardContent>
      </Card>
    </div>
  );
}
