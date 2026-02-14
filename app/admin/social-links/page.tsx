"use client";

/**
 * 管理后台 - 社交链接管理页面
 *
 * 完整功能：
 * - 社交链接列表展示
 * - 创建社交链接
 * - 编辑社交链接
 * - 删除社交链接
 * - 拖拽排序
 * - 预览链接
 */

import { useState, useEffect } from "react";
import {
  listSocialLinks,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
  updateSocialLinksOrder,
  type SocialLink,
} from "@/actions/admin-social-links";
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
import {
  Loader2,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Eye,
  ExternalLink,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Github,
  Twitter,
  Linkedin,
  Instagram,
  Youtube,
  Facebook,
  Mail,
  Globe,
} from "lucide-react";

// 常用社交平台图标配置
const SOCIAL_ICONS = [
  { value: "github", label: "GitHub", icon: Github },
  { value: "twitter", label: "Twitter", icon: Twitter },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin },
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "youtube", label: "YouTube", icon: Youtube },
  { value: "facebook", label: "Facebook", icon: Facebook },
  { value: "email", label: "Email", icon: Mail },
  { value: "website", label: "Website", icon: Globe },
];

export default function SocialLinksManagementPage() {
  // ==================== 状态管理 ====================
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 对话框状态
  const [viewingLink, setViewingLink] = useState<SocialLink | null>(null);
  const [editingLink, setEditingLink] = useState<SocialLink | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [deletingLink, setDeletingLink] = useState<SocialLink | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    icon: "github",
    title: "",
    description: "",
    url: "",
    order: 0,
  });

  // ==================== 数据加载 ====================
  async function loadLinks() {
    setLoading(true);
    setError(null);

    try {
      const result = await listSocialLinks();

      if (result.success && result.data) {
        setLinks(result.data);
      } else {
        setError(result.error || "加载失败");
      }
    } catch (err) {
      setError("加载社交链接失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLinks();
  }, []);

  // ==================== CRUD 操作 ====================
  async function handleCreateLink() {
    setSubmitting(true);
    setError(null);

    try {
      const result = await createSocialLink(formData);

      if (result.success) {
        setCreatingLink(false);
        resetForm();
        loadLinks();
      } else {
        setError(result.error || "创建失败");
      }
    } catch (err) {
      setError("创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateLink() {
    if (!editingLink) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await updateSocialLink(editingLink.id, formData);

      if (result.success) {
        setEditingLink(null);
        resetForm();
        loadLinks();
      } else {
        setError(result.error || "更新失败");
      }
    } catch (err) {
      setError("更新失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(link: SocialLink) {
    setSubmitting(true);

    try {
      const result = await deleteSocialLink(link.id);

      if (result.success) {
        setDeletingLink(null);
        loadLinks();
      } else {
        setError(result.error || "删除失败");
      }
    } catch (err) {
      setError("删除失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function moveLinkUp(index: number) {
    if (index === 0) return;

    const newLinks = [...links];
    const temp = newLinks[index - 1];
    newLinks[index - 1] = newLinks[index];
    newLinks[index] = temp;

    // 更新order
    const updates = newLinks.map((link, i) => ({
      id: link.id,
      order: i,
    }));

    try {
      await updateSocialLinksOrder(updates);
      setLinks(newLinks);
    } catch (err) {
      setError("更新排序失败");
    }
  }

  async function moveLinkDown(index: number) {
    if (index === links.length - 1) return;

    const newLinks = [...links];
    const temp = newLinks[index + 1];
    newLinks[index + 1] = newLinks[index];
    newLinks[index] = temp;

    // 更新order
    const updates = newLinks.map((link, i) => ({
      id: link.id,
      order: i,
    }));

    try {
      await updateSocialLinksOrder(updates);
      setLinks(newLinks);
    } catch (err) {
      setError("更新排序失败");
    }
  }

  // ==================== 表单处理 ====================
  function resetForm() {
    setFormData({
      icon: "github",
      title: "",
      description: "",
      url: "",
      order: links.length,
    });
  }

  function openCreateDialog() {
    resetForm();
    setCreatingLink(true);
  }

  function openEditDialog(link: SocialLink) {
    setFormData({
      icon: link.icon,
      title: link.title,
      description: link.description || "",
      url: link.url,
      order: link.order,
    });
    setEditingLink(link);
  }

  // ==================== 工具函数 ====================
  function getIconComponent(iconName: string, className = "h-5 w-5") {
    const iconConfig = SOCIAL_ICONS.find((i) => i.value === iconName);
    const IconComponent = iconConfig?.icon || Globe;
    return <IconComponent className={className} />;
  }

  function getIconLabel(iconName: string) {
    const iconConfig = SOCIAL_ICONS.find((i) => i.value === iconName);
    return iconConfig?.label || iconName;
  }

  // ==================== 渲染 ====================
  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">社交链接管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理网站社交媒体链接，共 {links.length} 个链接
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadLinks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            新建链接
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 社交链接列表 */}
      <Card>
        <CardHeader>
          <CardTitle>链接列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              暂无社交链接
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link, index) => (
                <div
                  key={link.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  {/* 拖拽手柄 */}
                  <div className="flex items-center gap-1">
                    <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => moveLinkUp(index)}
                        disabled={index === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => moveLinkDown(index)}
                        disabled={index === links.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* 图标 */}
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    {getIconComponent(link.icon)}
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{link.title}</h3>
                      <Badge variant="outline">#{link.order}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {link.url}
                    </p>
                    {link.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {link.description}
                      </p>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewingLink(link)}
                      title="预览"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(link)}
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
                            确定要删除社交链接 "{link.title}" 吗？此操作不可恢复。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              setDeletingLink(link);
                              handleDelete(link);
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建/编辑链接对话框 */}
      <Dialog open={creatingLink || !!editingLink} onOpenChange={(open) => {
        if (!open) {
          setCreatingLink(false);
          setEditingLink(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLink ? "编辑链接" : "新建链接"}</DialogTitle>
            <DialogDescription>
              {editingLink ? "修改社交链接信息" : "添加新的社交媒体链接"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="icon">图标 *</Label>
              <Select
                value={formData.icon}
                onValueChange={(value) => setFormData({ ...formData, icon: value })}
              >
                <SelectTrigger id="icon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOCIAL_ICONS.map((icon) => {
                    const IconComponent = icon.icon;
                    return (
                      <SelectItem key={icon.value} value={icon.value}>
                        <div className="flex items-center gap-2">
                          <IconComponent className="h-4 w-4" />
                          {icon.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">标题 *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如：关注我们的 GitHub"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">链接 URL *</Label>
              <Input
                id="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://github.com/username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="简短描述（可选）"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order">排序</Label>
              <Input
                id="order"
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                placeholder="数字越小越靠前"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreatingLink(false);
                setEditingLink(null);
                resetForm();
              }}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              onClick={editingLink ? handleUpdateLink : handleCreateLink}
              disabled={submitting || !formData.title || !formData.url}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {editingLink ? "更新中..." : "创建中..."}
                </>
              ) : (
                editingLink ? "更新" : "创建"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 预览链接对话框 */}
      <Dialog open={!!viewingLink} onOpenChange={() => setViewingLink(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>链接预览</DialogTitle>
          </DialogHeader>
          {viewingLink && (
            <div className="space-y-4">
              <div className="flex items-center justify-center p-6">
                <div className="text-center space-y-3">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    {getIconComponent(viewingLink.icon, "h-8 w-8")}
                  </div>
                  <h3 className="text-lg font-semibold">{viewingLink.title}</h3>
                  {viewingLink.description && (
                    <p className="text-sm text-muted-foreground">
                      {viewingLink.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">图标：</span>
                  <span className="flex items-center gap-1">
                    {getIconComponent(viewingLink.icon, "h-4 w-4")}
                    {getIconLabel(viewingLink.icon)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">排序：</span>
                  <span>#{viewingLink.order}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">链接：</span>
                  <a
                    href={viewingLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary flex items-center gap-1 hover:underline text-xs truncate max-w-[200px]"
                  >
                    {viewingLink.url}
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewingLink(null)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
