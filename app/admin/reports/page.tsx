"use client";

/**
 * 管理后台 - 举报管理页面
 *
 * 功能：
 * - 显示举报列表（举报人、被举报人、类型、状态、时间）
 * - 支持按状态筛选
 * - 支持查看详情
 * - 支持处理/驳回操作
 */

import { useState, useEffect, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  User,
} from "lucide-react";

// 举报类型定义
interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  type: string;
  description: string | null;
  status: string;
  admin_notes: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
}

// 举报类型映射
const REPORT_TYPES: Record<string, { label: string; color: string }> = {
  harassment: { label: "骚扰", color: "bg-red-100 text-red-800" },
  spam: { label: "垃圾信息", color: "bg-yellow-100 text-yellow-800" },
  inappropriate: { label: "不当内容", color: "bg-purple-100 text-purple-800" },
  fake_profile: { label: "虚假资料", color: "bg-blue-100 text-blue-800" },
  other: { label: "其他", color: "bg-gray-100 text-gray-800" },
};

export default function ReportsManagementPage() {
  // ==================== 状态管理 ====================
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [processingReport, setProcessingReport] = useState<Report | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [filterType, setFilterType] = useState<string>("all");

  // ==================== 筛选后的举报列表 ====================
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (filterStatus !== "all" && report.status !== filterStatus) {
        return false;
      }
      if (filterType !== "all" && report.type !== filterType) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          report.reporter_id.toLowerCase().includes(query) ||
          report.reported_user_id.toLowerCase().includes(query) ||
          report.description?.toLowerCase().includes(query) ||
          false
        );
      }
      return true;
    });
  }, [reports, filterStatus, filterType, searchQuery]);

  // ==================== 数据加载 ====================
  async function loadReports() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        status: filterStatus === "all" ? "" : filterStatus,
        page: page.toString(),
        limit: pageSize.toString(),
      });

      const response = await fetch(`/api/admin/reports?${params}`);
      const result = await response.json();

      if (result.success && result.data) {
        setReports(result.data.items);
        setTotal(result.data.total);
      } else {
        setError(result.error || "加载失败");
      }
    } catch (err) {
      setError("加载举报列表失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, [page, filterStatus]);

  // ==================== 操作处理 ====================
  async function handleReportAction(status: "resolved" | "dismissed") {
    if (!processingReport) return;

    setActionLoading(true);
    try {
      const response = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: processingReport.id,
          status,
          adminNotes: adminNotes || undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 更新本地状态
        setReports((prev) =>
          prev.map((r) =>
            r.id === processingReport.id
              ? { ...r, status, admin_notes: adminNotes, handled_at: new Date().toISOString() }
              : r
          )
        );
        setProcessingReport(null);
        setAdminNotes("");
      } else {
        alert(result.error || "操作失败");
      }
    } catch (err) {
      alert("操作失败，请重试");
    } finally {
      setActionLoading(false);
    }
  }

  // ==================== 工具函数 ====================
  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 gap-1">
            <Clock className="h-3 w-3" />
            待处理
          </Badge>
        );
      case "resolved":
        return (
          <Badge variant="default" className="bg-green-600 gap-1">
            <CheckCircle className="h-3 w-3" />
            已处理
          </Badge>
        );
      case "dismissed":
        return (
          <Badge variant="outline" className="gap-1">
            <XCircle className="h-3 w-3" />
            已驳回
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getTypeBadge(type: string) {
    const config = REPORT_TYPES[type] || REPORT_TYPES.other;
    return (
      <Badge variant="secondary" className={config.color}>
        {config.label}
      </Badge>
    );
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

  function truncateId(id: string) {
    return id.length > 12 ? `${id.slice(0, 12)}...` : id;
  }

  // ==================== 分页 ====================
  const totalPages = Math.ceil(total / pageSize);

  // ==================== 统计 ====================
  const stats = useMemo(() => {
    return {
      total: reports.length,
      pending: reports.filter((r) => r.status === "pending").length,
      resolved: reports.filter((r) => r.status === "resolved").length,
      dismissed: reports.filter((r) => r.status === "dismissed").length,
    };
  }, [reports]);

  // ==================== 渲染 ====================
  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">举报管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看和处理用户举报，共 {total} 条记录
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadReports} disabled={loading}>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              总举报数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              待处理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              已处理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              已驳回
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.dismissed}</div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索举报人、被举报人或描述..."
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
                <SelectItem value="pending">待处理</SelectItem>
                <SelectItem value="resolved">已处理</SelectItem>
                <SelectItem value="dismissed">已驳回</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="举报类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(REPORT_TYPES).map(([key, value]) => (
                  <SelectItem key={key} value={key}>
                    {value.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 清除筛选 */}
            {(searchQuery || filterStatus !== "all" || filterType !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                  setFilterType("all");
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 举报列表 */}
      <Card>
        <CardHeader>
          <CardTitle>举报列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || filterStatus !== "all" || filterType !== "all"
                ? "没有符合筛选条件的举报记录"
                : "暂无举报记录"}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">ID</TableHead>
                      <TableHead>举报人</TableHead>
                      <TableHead>被举报人</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell>
                          <div className="font-mono text-xs">
                            {truncateId(report.id)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="font-mono text-xs">
                              {truncateId(report.reporter_id)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            </div>
                            <div className="font-mono text-xs">
                              {truncateId(report.reported_user_id)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(report.type)}</TableCell>
                        <TableCell>
                          <div className="max-w-[200px] truncate text-sm text-muted-foreground">
                            {report.description || "-"}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(report.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(report.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setViewingReport(report)}
                              title="查看详情"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {report.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setProcessingReport(report)}
                                title="处理举报"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

      {/* 查看举报详情对话框 */}
      <Dialog open={!!viewingReport} onOpenChange={() => setViewingReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>举报详情</DialogTitle>
          </DialogHeader>
          {viewingReport && (
            <div className="space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">举报ID：</span>
                  <div className="font-mono text-xs mt-1">{viewingReport.id}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">举报类型：</span>
                  <div className="mt-1">{getTypeBadge(viewingReport.type)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">举报人ID：</span>
                  <div className="font-mono text-xs mt-1">{viewingReport.reporter_id}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">被举报人ID：</span>
                  <div className="font-mono text-xs mt-1">{viewingReport.reported_user_id}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">状态：</span>
                  <div className="mt-1">{getStatusBadge(viewingReport.status)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">创建时间：</span>
                  <div className="mt-1">{formatDate(viewingReport.created_at)}</div>
                </div>
              </div>

              {/* 举报描述 */}
              <div>
                <span className="text-muted-foreground text-sm">举报描述：</span>
                <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
                  {viewingReport.description || "无描述"}
                </div>
              </div>

              {/* 处理信息 */}
              {viewingReport.status !== "pending" && (
                <div>
                  <span className="text-muted-foreground text-sm">处理信息：</span>
                  <div className="mt-2 p-3 bg-muted rounded-lg text-sm space-y-2">
                    <div>
                      <span className="text-muted-foreground">处理人：</span>
                      <span className="font-mono ml-2">{viewingReport.handled_by || "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">处理时间：</span>
                      <span className="ml-2">{formatDate(viewingReport.handled_at)}</span>
                    </div>
                    {viewingReport.admin_notes && (
                      <div>
                        <span className="text-muted-foreground">处理备注：</span>
                        <p className="mt-1">{viewingReport.admin_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewingReport(null)}
            >
              关闭
            </Button>
            {viewingReport?.status === "pending" && (
              <Button onClick={() => {
                setViewingReport(null);
                setProcessingReport(viewingReport);
              }}>
                处理举报
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 处理举报对话框 */}
      <Dialog open={!!processingReport} onOpenChange={() => {
        setProcessingReport(null);
        setAdminNotes("");
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>处理举报</DialogTitle>
            <DialogDescription>
              请选择处理方式，并填写处理备注（可选）
            </DialogDescription>
          </DialogHeader>
          {processingReport && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="font-medium mb-1">举报信息</div>
                <div className="text-muted-foreground">
                  类型：{REPORT_TYPES[processingReport.type]?.label || processingReport.type}
                </div>
                <div className="text-muted-foreground truncate">
                  描述：{processingReport.description || "无"}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">处理备注</label>
                <Textarea
                  placeholder="请输入处理备注（可选）"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="mt-2"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setProcessingReport(null);
                setAdminNotes("");
              }}
              disabled={actionLoading}
            >
              取消
            </Button>
            <Button
              variant="outline"
              onClick={() => handleReportAction("dismissed")}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              驳回
            </Button>
            <Button
              onClick={() => handleReportAction("resolved")}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              处理完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
