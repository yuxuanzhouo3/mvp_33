"use client";

/**
 * 管理后台 - 数据统计页面
 *
 * 改造后的统计页面，参考模板项目设计
 * 包含：核心指标卡片、版本对比、趋势图表等
 */

import { useState, useEffect } from "react";
import { getUserStats, getUserTrends } from "@/actions/admin-users";
import { getPaymentStats, getPaymentTrends } from "@/actions/admin-payments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAmountWithCurrency } from "@/lib/utils/currency";
import { isValidPaymentStats } from "@/lib/utils/validation";
import { RegionConfig, isChinaRegion } from "@/lib/config/region";
import {
  Loader2,
  Users,
  DollarSign,
  TrendingUp,
  Activity,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

export default function DashboardPage() {
  // ==================== 状态管理 ====================
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("30"); // 时间范围（天）

  const [userStats, setUserStats] = useState<any>(null);
  const [paymentStats, setPaymentStats] = useState<any>(null);
  const [userTrends, setUserTrends] = useState<any>(null);
  const [paymentTrends, setPaymentTrends] = useState<any>(null);

  // ==================== 数据加载 ====================
  async function loadAllStats() {
    setError(null);
    try {
      const days = parseInt(timeRange);
      const [users, payments, userTrendData, paymentTrendData] = await Promise.all([
        getUserStats(),
        getPaymentStats(),
        getUserTrends(days),
        getPaymentTrends(days),
      ]);

      // Validate all responses before updating state
      if (!users.success || !payments.success || !userTrendData.success || !paymentTrendData.success) {
        throw new Error("部分数据加载失败");
      }

      // Atomic state update - all or nothing
      if (users.data && payments.data && userTrendData.data && paymentTrendData.data) {
        setUserStats(users.data);
        setPaymentStats(payments.data);
        setUserTrends(userTrendData.data);
        setPaymentTrends(paymentTrendData.data);
      } else {
        throw new Error("数据验证失败");
      }

      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      setError("加载统计数据失败");
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadAllStats();

    return () => {
      // No cleanup needed - state persists across visibility changes
    };
  }, [timeRange]);

  // Auto-refresh data when tab becomes visible after being idle
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading && !refreshing) {
        loadAllStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loading, refreshing]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    setUserStats(null);
    setPaymentStats(null);
    setUserTrends(null);
    setPaymentTrends(null);
    await loadAllStats();
  }

  // ==================== 格式化函数 ====================
  function formatAmount(amount: number) {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
    }).format(amount);
  }

  function formatNumber(num: number) {
    return new Intl.NumberFormat("zh-CN").format(num);
  }


  // ==================== 渲染 ====================
  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">用户数据统计</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看用户、付费、设备等统计数据
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 刷新按钮 */}
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <Loader2 className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <Card className="border-red-600">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* 加载状态 */}
      {loading || !userStats || !paymentStats || !isValidPaymentStats(paymentStats) ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* 核心指标卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 总用户数 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总用户数</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{formatNumber(userStats?.total || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  今日新增 <span className="font-semibold text-green-600">+{userStats?.newToday || 0}</span>
                </p>
              </CardContent>
            </Card>

            {/* 月活用户 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">月活用户</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{formatNumber(userStats?.monthlyActive || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  日活 <span className="font-medium">{userStats?.dailyActive || 0}</span> / 周活 <span className="font-medium">{userStats?.activeThisWeek || 0}</span>
                </p>
              </CardContent>
            </Card>

            {/* 总收入 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总收入</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground leading-tight">
                  {formatAmount(paymentStats?.totalRevenue || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  今日: <span className="font-semibold text-green-600">
                    +{formatAmount(paymentTrends?.todayRevenue || 0)}
                  </span>
                </p>
              </CardContent>
            </Card>

            {/* 付费用户 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">付费用户</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{formatNumber(userStats?.paidUsers || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  转化率 <span className="font-semibold text-primary">{userStats?.conversionRate || 0}%</span>
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 版本对比区域 */}
          <div className="grid grid-cols-1 gap-4">
            {isChinaRegion() ? (
              /* 国内版 */
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">国内版</CardTitle>
                  <p className="text-xs text-muted-foreground">数据概览</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-3xl font-bold text-foreground">
                        {formatNumber(userStats?.byRegion?.domestic || 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">用户数</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-foreground">
                        {formatAmount((paymentStats?.byMethod?.wechat ?? 0) + (paymentStats?.byMethod?.alipay ?? 0))}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">总收入</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* 国际版 */
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">国际版</CardTitle>
                  <p className="text-xs text-muted-foreground">数据概览</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-3xl font-bold text-foreground">
                        {formatNumber(userStats?.byRegion?.international || 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">用户数</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-foreground">
                        ${formatNumber((paymentStats?.byMethod?.stripe ?? 0) + (paymentStats?.byMethod?.paypal ?? 0))}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">总收入</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 趋势图表 */}
          <Tabs defaultValue="users" className="space-y-4">
            <TabsList>
              <TabsTrigger value="users">用户趋势</TabsTrigger>
              <TabsTrigger value="revenue">收入趋势</TabsTrigger>
              <TabsTrigger value="devices">设备分布</TabsTrigger>
              <TabsTrigger value="subscriptions">订阅分布</TabsTrigger>
            </TabsList>

            {/* 用户趋势 */}
            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle>活跃用户趋势</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={{}} className="min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={userTrends?.daily || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis width={40} tick={{ fontSize: 12 }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey={isChinaRegion() ? "activeUsersDomestic" : "activeUsersInternational"} fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 收入趋势 */}
            <TabsContent value="revenue">
              <Card>
                <CardHeader>
                  <CardTitle>收入趋势</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={{}} className="min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={paymentTrends?.daily || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis width={50} tick={{ fontSize: 12 }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey={isChinaRegion() ? "revenueCNY" : "revenueUSD"}
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 设备分布 */}
            <TabsContent value="devices">
              <Card>
                <CardHeader>
                  <CardTitle>设备分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    暂无设备数据
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 订阅分布 */}
            <TabsContent value="subscriptions">
              <Card>
                <CardHeader>
                  <CardTitle>订阅分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { label: "免费用户", value: userStats?.free || 0, color: "bg-gray-500" },
                      { label: "专业版", value: userStats?.pro || 0, color: "bg-green-500" },
                      { label: "企业版", value: userStats?.enterprise || 0, color: "bg-purple-500" },
                    ].map((item) => {
                      const total = (userStats?.total || 1);
                      const percentage = (item.value / total * 100).toFixed(1);
                      return (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>{item.label}</span>
                            <span className="text-muted-foreground">{percentage}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${item.color} transition-all`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* 数据更新时间 */}
          <p className="text-xs text-muted-foreground text-center">
            数据更新时间: {paymentTrends?.lastUpdated
              ? new Date(paymentTrends.lastUpdated).toLocaleString('zh-CN')
              : new Date().toLocaleString('zh-CN')}
          </p>
        </>
      )}
    </div>
  );
}
