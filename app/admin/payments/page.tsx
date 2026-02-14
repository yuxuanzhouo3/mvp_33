"use client";

/**
 * 管理后台 - 支付记录管理页面
 *
 * 完整功能：
 * - 支付记录列表展示（支持分页）
 * - 搜索和筛选
 * - 查看支付详情
 * - 支付统计展示
 * - 收入分析
 */

import { useState, useEffect, useMemo } from "react";
import {
  listPayments,
  getPaymentById,
  getPaymentStats,
  type Payment,
} from "@/actions/admin-payments";
import { getAvailablePaymentMethods, getPaymentMethodConfig } from "@/lib/utils/payment-methods";
import { RegionConfig } from "@/lib/config/region";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  TrendingUp,
  Calendar,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  ArrowDownCircle,
} from "lucide-react";

export default function PaymentsManagementPage() {
  // ==================== 状态管理 ====================
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingPayment, setViewingPayment] = useState<Payment | null>(null);

  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("paid");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // ==================== 筛选后的支付列表 ====================
  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      if (filterStatus !== "all" && payment.status !== filterStatus) {
        return false;
      }
      if (filterMethod !== "all" && payment.method !== filterMethod) {
        return false;
      }
      if (filterType !== "all" && payment.type !== filterType) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          payment.user_email?.toLowerCase().includes(query) ||
          payment.order_id?.toLowerCase().includes(query) ||
          payment.id.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [payments, filterStatus, filterMethod, filterType, searchQuery]);

  // ==================== 数据加载 ====================
  async function loadPayments() {
    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * pageSize;
      const result = await listPayments({
        limit: pageSize,
        offset,
      });

      if (result.success && result.data) {
        setPayments(result.data.items);
        setTotal(result.data.total);
      } else {
        setError(result.error || "加载失败");
      }
    } catch (err) {
      setError("加载支付记录失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const result = await getPaymentStats();
      if (result.success && result.data) {
        setStats(result.data);
      }
    } catch (err) {
      console.error("加载统计失败:", err);
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
  }, [page]);

  useEffect(() => {
    loadStats();
  }, []);

  // ==================== 工具函数 ====================
  function getStatusBadge(status: string) {
    switch (status) {
      case "completed":
      case "paid":
        return (
          <Badge variant="default" className="bg-green-600 gap-1">
            <CheckCircle className="h-3 w-3" />
            已完成
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-600 gap-1">
            <Clock className="h-3 w-3" />
            待处理
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            失败
          </Badge>
        );
      case "refunded":
        return (
          <Badge variant="outline" className="gap-1">
            <ArrowDownCircle className="h-3 w-3" />
            已退款
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getMethodBadge(method: string) {
    const methodConfig: Record<string, { label: string; color: string; icon: string }> = {
      wechat: { label: "微信支付", color: "bg-green-600", icon: "💚" },
      alipay: { label: "支付宝", color: "bg-blue-600", icon: "💙" },
      stripe: { label: "Stripe", color: "bg-purple-600", icon: "💳" },
      paypal: { label: "PayPal", color: "bg-yellow-600", icon: "🅿️" },
    };

    const config = methodConfig[method] || { label: method, color: "bg-gray-600", icon: "💰" };
    return (
      <Badge variant="secondary" className={`${config.color} gap-1`}>
        <span>{config.icon}</span>
        {config.label}
      </Badge>
    );
  }

  function getTypeBadge(type: string) {
    const typeConfig: Record<string, { label: string; variant: any }> = {
      subscription: { label: "订阅", variant: "default" as const },
      tokens: { label: "代币", variant: "secondary" as const },
      pro: { label: "专业版", variant: "outline" as const },
    };

    const config = typeConfig[type] || { label: type, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  }

  function formatAmount(amount: number, currency: string) {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  }

  function formatDate(dateStr: string | undefined) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDateOnly(dateStr: string | undefined) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  // ==================== 分页 ====================
  const totalPages = Math.ceil(total / pageSize);

  // ==================== 渲染 ====================
  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">支付记录管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看和管理所有支付记录，共 {total} 条记录
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPayments} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statsLoading ? (
          // 骨架屏：加载时显示
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : stats ? (
          // 数据加载完成：显示实际数据
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  总支付数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  总订单数
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  本月支付
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.thisMonth}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  今日支付
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.today}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  总收入
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatAmount(stats.totalRevenue, RegionConfig.payment.currency)}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* 收入分析卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            按支付方式统计收入
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            // 骨架屏：加载时显示
            <div className="grid grid-cols-2 gap-4">
              {getAvailablePaymentMethods().map((method, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-16 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : stats ? (
            // 数据加载完成：显示实际数据
            <div className="grid grid-cols-2 gap-4">
              {getAvailablePaymentMethods().map((method) => {
                const config = getPaymentMethodConfig(method);
                const amount = stats.byMethod[method] || 0;
                const currency = RegionConfig.payment.currency;
                const colorClass = config.color.replace('bg-', '');

                return (
                  <div key={method} className={`flex items-center gap-3 p-3 bg-${colorClass.split('-')[0]}-50 dark:bg-${colorClass.split('-')[0]}-950 rounded-lg`}>
                    <div className={`h-10 w-10 rounded-full ${config.color} flex items-center justify-center text-white`}>
                      {config.icon}
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{config.label}</div>
                      <div className="font-semibold">{formatAmount(amount, currency)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 搜索和筛选栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户邮箱或订单ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="pending">待处理</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="refunded">已退款</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="支付方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部方式</SelectItem>
                {getAvailablePaymentMethods().map((method) => {
                  const config = getPaymentMethodConfig(method);
                  return (
                    <SelectItem key={method} value={method}>
                      {config.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="支付类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="subscription">订阅</SelectItem>
                <SelectItem value="tokens">代币</SelectItem>
                <SelectItem value="pro">专业版</SelectItem>
              </SelectContent>
            </Select>

            {/* 清除筛选 */}
            {(searchQuery || filterStatus !== "all" || filterMethod !== "all" || filterType !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                  setFilterMethod("all");
                  setFilterType("all");
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 支付记录列表 */}
      <Card>
        <CardHeader>
          <CardTitle>支付记录列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || filterStatus !== "all" || filterMethod !== "all" || filterType !== "all"
                ? "没有符合筛选条件的支付记录"
                : "暂无支付记录"}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">订单ID</TableHead>
                      <TableHead>用户</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>支付方式</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>完成时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div className="font-mono text-xs">
                            {payment.order_id || payment.id.slice(0, 12)}...
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Wallet className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                {payment.user_email || "未知用户"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                ID: {payment.user_id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">
                            {formatAmount(payment.amount, payment.currency)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getMethodBadge(payment.method)}
                        </TableCell>
                        <TableCell>
                          {getTypeBadge(payment.type)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(payment.status)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateOnly(payment.created_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateOnly(payment.completed_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setViewingPayment(payment)}
                            title="查看详情"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {total > pageSize && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    显示第 {(page - 1) * pageSize + 1} -{" "}
                    {Math.min(page * pageSize, total)} 条，共 {total} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      上一页
                    </Button>
                    <div className="text-sm">
                      第 <span className="font-medium">{page}</span> /{" "}
                      <span>{totalPages}</span> 页
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      下一页
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 查看支付详情对话框 */}
      <Dialog open={!!viewingPayment} onOpenChange={() => setViewingPayment(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>支付详情</DialogTitle>
          </DialogHeader>
          {viewingPayment && (
            <div className="space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">订单ID：</span>
                  <div className="font-mono text-xs mt-1">{viewingPayment.order_id || viewingPayment.id}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">用户ID：</span>
                  <div className="font-mono text-xs mt-1">{viewingPayment.user_id}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">用户邮箱：</span>
                  <div className="mt-1">{viewingPayment.user_email || "未知"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">支付金额：</span>
                  <div className="mt-1 font-semibold text-lg">
                    {formatAmount(viewingPayment.amount, viewingPayment.currency)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">支付方式：</span>
                  <div className="mt-1">{getMethodBadge(viewingPayment.method)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">支付类型：</span>
                  <div className="mt-1">{getTypeBadge(viewingPayment.type)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">支付状态：</span>
                  <div className="mt-1">{getStatusBadge(viewingPayment.status)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">产品ID：</span>
                  <div className="mt-1">{viewingPayment.product_id || "-"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">创建时间：</span>
                  <div className="mt-1">{formatDate(viewingPayment.created_at)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">完成时间：</span>
                  <div className="mt-1">{formatDate(viewingPayment.completed_at)}</div>
                </div>
              </div>

              {/* 时间线 */}
              <div>
                <h3 className="text-sm font-medium mb-3">支付时间线</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">订单创建</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(viewingPayment.created_at)}
                      </div>
                    </div>
                  </div>
                  {viewingPayment.completed_at && (
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">支付完成</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(viewingPayment.completed_at)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewingPayment(null)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
