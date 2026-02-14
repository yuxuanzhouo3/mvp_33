"use client";

/**
 * 管理后台 - 广告管理页面
 *
 * 完整功能：
 * - 广告列表展示（支持分页）
 * - 创建广告
 * - 编辑广告
 * - 删除广告
 * - 切换广告状态
 * - 拖拽排序优先级
 * - 预览广告
 */

import { useState, useEffect, useMemo } from "react";
import {
  listAds,
  getAdStats,
  createAd,
  updateAd,
  deleteAd,
  toggleAdStatus,
  type Advertisement,
} from "@/actions/admin-ads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Search,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Video,
  Power,
  GripVertical,
  ExternalLink,
} from "lucide-react";

export default function AdsManagementPage() {
  // ==================== 状态管理 ====================
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPosition, setFilterPosition] = useState<string>("all");

  // 对话框状态
  const [viewingAd, setViewingAd] = useState<Advertisement | null>(null);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [creatingAd, setCreatingAd] = useState(false);
  const [deletingAd, setDeletingAd] = useState<Advertisement | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    title: "",
    type: "image" as "image" | "video",
    position: "bottom" as const,
    fileUrl: "",
    fileUrlCn: "",
    fileUrlIntl: "",
    linkUrl: "",
    priority: 0,
    status: "active" as "active" | "inactive",
    startDate: "",
    endDate: "",
    fileSize: 0 as number,
    file: null as File | null,
  });

  // ==================== 筛选后的广告列表 ====================
  const filteredAds = useMemo(() => {
    return ads.filter((ad) => {
      if (filterStatus !== "all" && ad.status !== filterStatus) {
        return false;
      }
      if (filterPosition !== "all" && ad.position !== filterPosition) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return ad.title.toLowerCase().includes(query);
      }
      return true;
    });
  }, [ads, filterStatus, filterPosition, searchQuery]);

  // ==================== 数据加载 ====================
  async function loadAds() {
    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * pageSize;
      const result = await listAds({
        limit: pageSize,
        offset,
      });

      if (result.success && result.data) {
        setAds(result.data.items);
        setTotal(result.data.total);
      } else {
        setError(result.error || "加载失败");
      }
    } catch (err) {
      setError("加载广告失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const result = await getAdStats();
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
    loadAds();
  }, [page]);

  useEffect(() => {
    loadStats();
  }, []);

  // ==================== CRUD 操作 ====================
  async function handleCreateAd() {
    setSubmitting(true);
    setError(null);

    try {
      // 构造 FormData
      const formDataToSend = new FormData();
      formDataToSend.append("title", formData.title);
      formDataToSend.append("type", formData.type);
      formDataToSend.append("position", formData.position);
      formDataToSend.append("linkUrl", formData.linkUrl || "");
      formDataToSend.append("priority", String(formData.priority));
      formDataToSend.append("status", formData.status);

      // 添加文件
      if (formData.file) {
        formDataToSend.append("file", formData.file);
      } else {
        setError("请上传广告文件");
        setSubmitting(false);
        return;
      }

      const result = await createAd(formDataToSend);

      if (result.success) {
        setCreatingAd(false);
        resetForm();
        loadAds();
        loadStats();
      } else {
        setError(result.error || "创建失败");
      }
    } catch (err) {
      setError("创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateAd() {
    if (!editingAd) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await updateAd(editingAd.id, formData);

      if (result.success) {
        setEditingAd(null);
        resetForm();
        loadAds();
        loadStats();
      } else {
        setError(result.error || "更新失败");
      }
    } catch (err) {
      setError("更新失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(ad: Advertisement) {
    setSubmitting(true);

    try {
      const result = await deleteAd(ad.id);

      if (result.success) {
        setDeletingAd(null);
        loadAds();
        loadStats();
      } else {
        setError(result.error || "删除失败");
      }
    } catch (err) {
      setError("删除失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(ad: Advertisement) {
    try {
      const result = await toggleAdStatus(ad.id);

      if (result.success) {
        loadAds();
        loadStats();
      } else {
        setError(result.error || "切换状态失败");
      }
    } catch (err) {
      setError("切换状态失败");
    }
  }

  // ==================== 表单处理 ====================
  function resetForm() {
    setFormData({
      title: "",
      type: "image",
      position: "bottom",
      fileUrl: "",
      fileUrlCn: "",
      fileUrlIntl: "",
      linkUrl: "",
      priority: 0,
      status: "active",
      startDate: "",
      endDate: "",
    });
  }

  function openCreateDialog() {
    resetForm();
    setCreatingAd(true);
  }

  function openEditDialog(ad: Advertisement) {
    setFormData({
      title: ad.title,
      type: ad.type,
      position: ad.position,
      fileUrl: ad.fileUrl,
      fileUrlCn: ad.fileUrlCn || "",
      fileUrlIntl: ad.fileUrlIntl || "",
      linkUrl: ad.linkUrl || "",
      priority: ad.priority,
      status: ad.status,
      startDate: ad.startDate || "",
      endDate: ad.endDate || "",
    });
    setEditingAd(ad);
  }

  // ==================== 工具函数 ====================
  function getStatusBadge(status: string) {
    return status === "active" ? (
      <Badge variant="default" className="bg-green-600 gap-1">
        <Power className="h-3 w-3" />
        上架
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1">
        <Power className="h-3 w-3" />
        下架
      </Badge>
    );
  }

  function formatFileSize(bytes: number): string {
    if (!bytes) return "-";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatUploadTime(dateStr: string): string {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  }

  function getTypeBadge(type: string) {
    return type === "image" ? (
      <Badge variant="secondary" className="gap-1">
        <ImageIcon className="h-3 w-3" />
        图片
      </Badge>
    ) : (
      <Badge variant="secondary" className="gap-1">
        <Video className="h-3 w-3" />
        视频
      </Badge>
    );
  }

  function getPositionLabel(position: string) {
    const labels: Record<string, string> = {
      top: "顶部",
      bottom: "底部",
      left: "左侧",
      right: "右侧",
      "bottom-left": "左下角",
      "bottom-right": "右下角",
      sidebar: "侧边栏",
    };
    return labels[position] || position;
  }

  function formatDate(dateStr: string | undefined) {
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
          <h1 className="text-2xl font-bold">广告管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理网站广告内容，共 {total} 条广告
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAds} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            新建广告
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
                  <Skeleton className="h-8 w-16" />
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
                  总广告数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  激活中
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  已禁用
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-muted-foreground">{stats.inactive}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  图片/视频
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">
                  {stats.byType?.image || 0} / {stats.byType?.video || 0}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* 搜索和筛选栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索广告标题..."
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
                <SelectItem value="active">上架</SelectItem>
                <SelectItem value="inactive">下架</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPosition} onValueChange={setFilterPosition}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="位置" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部位置</SelectItem>
                <SelectItem value="top">顶部</SelectItem>
                <SelectItem value="bottom">底部</SelectItem>
                <SelectItem value="left">左侧</SelectItem>
                <SelectItem value="right">右侧</SelectItem>
                <SelectItem value="bottom-left">左下角</SelectItem>
                <SelectItem value="bottom-right">右下角</SelectItem>
                <SelectItem value="sidebar">侧边栏</SelectItem>
              </SelectContent>
            </Select>

            {/* 清除筛选 */}
            {(searchQuery || filterStatus !== "all" || filterPosition !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                  setFilterPosition("all");
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 广告列表 */}
      <Card>
        <CardHeader>
          <CardTitle>广告列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || filterStatus !== "all" || filterPosition !== "all"
                ? "没有符合筛选条件的广告"
                : "暂无广告"}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">预览</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead className="w-[100px]">位置</TableHead>
                      <TableHead className="w-[80px]">类型</TableHead>
                      <TableHead className="w-[100px]">大小</TableHead>
                      <TableHead className="w-[140px]">上传时间</TableHead>
                      <TableHead className="w-[80px]">优先级</TableHead>
                      <TableHead className="w-[80px]">状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAds.map((ad) => (
                      <TableRow key={ad.id}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10"
                            onClick={() => setViewingAd(ad)}
                            title="预览"
                          >
                            {ad.type === "image" ? (
                              <img
                                src={ad.fileUrl}
                                alt={ad.title}
                                className="h-8 w-8 object-cover rounded"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                                <Video className="h-4 w-4 text-primary" />
                              </div>
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{ad.title}</div>
                          <div className="text-xs text-muted-foreground">
                            ID: {ad.id.slice(0, 8)}...
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getPositionLabel(ad.position)}</Badge>
                        </TableCell>
                        <TableCell>{getTypeBadge(ad.type)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ad.file_size ? formatFileSize(ad.file_size) : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatUploadTime(ad.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ad.priority}</Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(ad.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleStatus(ad)}
                              title={ad.status === "active" ? "下架" : "上架"}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(ad)}
                              title="编辑"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="删除"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    确定要删除广告 "{ad.title}" 吗？此操作不可恢复。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => {
                                      setDeletingAd(ad);
                                      handleDelete(ad);
                                    }}
                                    className="bg-red-600 hover:bg-red-700"
                                    disabled={submitting}
                                  >
                                    {submitting ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        删除中...
                                      </>
                                    ) : (
                                      "删除"
                                    )}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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

      {/* 创建/编辑广告对话框 */}
      <Dialog open={creatingAd || !!editingAd} onOpenChange={(open) => {
        if (!open) {
          setCreatingAd(false);
          setEditingAd(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAd ? "编辑广告" : "新建广告"}</DialogTitle>
            <DialogDescription>
              {editingAd ? "修改广告信息和设置" : "创建新的广告内容"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">广告标题 *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="输入广告标题"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">广告类型 *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">图片广告</SelectItem>
                    <SelectItem value="video">视频广告</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position">显示位置 *</Label>
                <Select
                  value={formData.position}
                  onValueChange={(value: any) => setFormData({ ...formData, position: value })}
                >
                  <SelectTrigger id="position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">顶部</SelectItem>
                    <SelectItem value="bottom">底部</SelectItem>
                    <SelectItem value="left">左侧</SelectItem>
                    <SelectItem value="right">右侧</SelectItem>
                    <SelectItem value="bottom-left">左下角</SelectItem>
                    <SelectItem value="bottom-right">右下角</SelectItem>
                    <SelectItem value="sidebar">侧边栏</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">优先级</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  placeholder="数字越大优先级越高"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">上传文件 *</Label>
              <Input
                id="file"
                type="file"
                accept="image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setFormData({
                      ...formData,
                      file: file,
                      fileSize: file.size,
                      fileUrl: URL.createObjectURL(file)
                    });
                  }
                }}
              />
              {formData.type === "image" && formData.file && (
                <div className="mt-2 h-32 rounded border overflow-hidden">
                  <img src={formData.fileUrl} alt="预览" className="h-full w-full object-cover" />
                </div>
              )}
              {formData.fileSize > 0 && (
                <p className="text-sm text-muted-foreground">
                  文件大小: {formatFileSize(formData.fileSize)}
                </p>
              )}
            </div>

            <div className="space-y-2">
                <Label htmlFor="status">状态</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">上架</SelectItem>
                    <SelectItem value="inactive">下架</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            <div className="space-y-2">
              <Label htmlFor="linkUrl">跳转链接</Label>
              <Input
                id="linkUrl"
                value={formData.linkUrl}
                onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreatingAd(false);
                setEditingAd(null);
                resetForm();
              }}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              onClick={editingAd ? handleUpdateAd : handleCreateAd}
              disabled={submitting || !formData.title || !formData.fileUrl}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {editingAd ? "更新中..." : "创建中..."}
                </>
              ) : (
                editingAd ? "更新" : "创建"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 预览广告对话框 */}
      <Dialog open={!!viewingAd} onOpenChange={() => setViewingAd(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>广告预览</DialogTitle>
          </DialogHeader>
          {viewingAd && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">广告内容</h3>
                {viewingAd.type === "image" ? (
                  <div className="rounded-lg overflow-hidden border">
                    <img
                      src={viewingAd.fileUrl}
                      alt={viewingAd.title}
                      className="w-full"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg overflow-hidden border bg-black aspect-video flex items-center justify-center">
                    <Video className="h-12 w-12 text-white/50" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">标题：</span>
                  <div className="mt-1">{viewingAd.title}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">类型：</span>
                  <div className="mt-1">{getTypeBadge(viewingAd.type)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">位置：</span>
                  <div className="mt-1">
                    <Badge variant="outline">{getPositionLabel(viewingAd.position)}</Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">状态：</span>
                  <div className="mt-1">{getStatusBadge(viewingAd.status)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">优先级：</span>
                  <div className="mt-1">{viewingAd.priority}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">跳转链接：</span>
                  <div className="mt-1">
                    {viewingAd.linkUrl ? (
                      <a
                        href={viewingAd.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary flex items-center gap-1 hover:underline"
                      >
                        {viewingAd.linkUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">有效期：</span>
                  <div className="mt-1">
                    {formatDate(viewingAd.startDate)} - {formatDate(viewingAd.endDate)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">创建时间：</span>
                  <div className="mt-1">{formatDate(viewingAd.created_at)}</div>
                </div>
              </div>

              {(viewingAd.fileUrlCn || viewingAd.fileUrlIntl) && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">区域化文件</h3>
                  <ScrollArea className="h-24 w-full rounded-md border p-4">
                    <div className="space-y-2 text-sm">
                      {viewingAd.fileUrlCn && (
                        <div>
                          <span className="text-muted-foreground">国内版：</span>
                          <a href={viewingAd.fileUrlCn} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2">
                            {viewingAd.fileUrlCn}
                          </a>
                        </div>
                      )}
                      {viewingAd.fileUrlIntl && (
                        <div>
                          <span className="text-muted-foreground">国际版：</span>
                          <a href={viewingAd.fileUrlIntl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2">
                            {viewingAd.fileUrlIntl}
                          </a>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewingAd(null)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
