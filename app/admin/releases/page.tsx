"use client";

import { useState, useEffect, useMemo } from "react";
import {
  listReleases,
  createRelease,
  updateRelease,
  deleteRelease,
  toggleReleaseStatus,
  type AppRelease,
  type Platform,
  type Variant,
} from "@/actions/admin-releases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  DialogTrigger,
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
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Database,
  Cloud,
  Search,
  X,
  Calendar,
  HardDrive,
  Download,
  ExternalLink,
  Smartphone,
  Monitor,
  Apple,
  AlertTriangle,
} from "lucide-react";

// 平台配置
const PLATFORMS: { value: Platform; label: string; icon: React.ReactNode }[] = [
  { value: "ios", label: "iOS", icon: <Apple className="h-4 w-4" /> },
  { value: "android", label: "Android", icon: <Smartphone className="h-4 w-4" /> },
  { value: "windows", label: "Windows", icon: <Monitor className="h-4 w-4" /> },
  { value: "macos", label: "macOS", icon: <Apple className="h-4 w-4" /> },
  { value: "linux", label: "Linux", icon: <Monitor className="h-4 w-4" /> },
];

// 变体配置（按平台分组）
const VARIANTS: Record<Platform, { value: Variant; label: string }[]> = {
  ios: [],
  android: [],
  windows: [
    { value: "x64", label: "x64 (64位)" },
    { value: "x86", label: "x86 (32位)" },
    { value: "arm64", label: "ARM64" },
  ],
  macos: [
    { value: "intel", label: "Intel 芯片" },
    { value: "m", label: "Apple Silicon (M系列)" },
  ],
  linux: [
    { value: "deb", label: "Debian/Ubuntu (.deb)" },
    { value: "rpm", label: "Red Hat/Fedora (.rpm)" },
    { value: "appimage", label: "AppImage" },
    { value: "snap", label: "Snap" },
    { value: "flatpak", label: "Flatpak" },
    { value: "aur", label: "AUR (Arch Linux)" },
  ],
};

function getVariantLabel(platform: Platform, variant?: Variant | null): string {
  if (!variant) return "";
  const variants = VARIANTS[platform];
  const config = variants?.find((v) => v.value === variant);
  return config?.label || variant;
}

function getPlatformIcon(platform: Platform) {
  const config = PLATFORMS.find((p) => p.value === platform);
  return config?.icon || <Monitor className="h-4 w-4" />;
}

function getPlatformLabel(platform: Platform) {
  const config = PLATFORMS.find((p) => p.value === platform);
  return config?.label || platform;
}

export default function ReleasesManagementPage() {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AppRelease | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // 新建表单的平台选择（用于动态显示变体选项）
  const [selectedPlatformForCreate, setSelectedPlatformForCreate] = useState<Platform>("android");

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // 筛选后的列表
  const filteredReleases = useMemo(() => {
    return releases.filter((release) => {
      if (searchQuery && !release.version.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (filterPlatform !== "all" && release.platform !== filterPlatform) {
        return false;
      }
      if (filterStatus !== "all") {
        const isActive = filterStatus === "active";
        if (release.is_active !== isActive) {
          return false;
        }
      }
      return true;
    });
  }, [releases, searchQuery, filterPlatform, filterStatus]);

  // 清除筛选
  function clearFilters() {
    setSearchQuery("");
    setFilterPlatform("all");
    setFilterStatus("all");
  }

  const hasFilters = searchQuery || filterPlatform !== "all" || filterStatus !== "all";

  // 格式化文件大小
  function formatFileSize(bytes?: number) {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // 加载发布版本列表
  async function loadReleases() {
    setLoading(true);
    setError(null);
    try {
      const result = await listReleases();
      if (result.success && result.data) {
        setReleases(result.data);
      } else {
        setError(result.error || "加载失败");
      }
    } catch (err) {
      setError("加载发布版本列表失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReleases();
  }, []);

  // 创建发布版本
  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const file = formData.get("file") as File;

      if (!file || file.size === 0) {
        setError("请选择要上传的文件");
        setCreating(false);
        return;
      }

      const version = formData.get("version") as string;
      const platform = formData.get("platform") as string;
      const variant = formData.get("variant") as string;
      const ext = file.name.split(".").pop();
      const variantSuffix = variant ? `-${variant}` : "";
      const fileName = `${platform}${variantSuffix}-${version}-${Date.now()}.${ext}`;

      // 关键修复: 无论上传目标是什么,都先通过API路由上传文件
      // 这样可以避免Next.js Server Actions的FormData大小限制
      console.log("[handleCreate] ========== 开始上传流程 ==========");
      console.log("[handleCreate] 文件信息:", {
        name: file.name,
        size: file.size,
        type: file.type,
        sizeInMB: (file.size / 1024 / 1024).toFixed(2) + "MB"
      });
      console.log("[handleCreate] 目标文件名:", fileName);

      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("fileName", fileName);

      console.log("[handleCreate] 开始调用 /api/upload/release...");

      let uploadResponse;
      try {
        uploadResponse = await fetch("/api/upload/release", {
          method: "POST",
          body: uploadFormData,
        });
        console.log("[handleCreate] API 响应状态:", uploadResponse.status, uploadResponse.statusText);
      } catch (fetchError) {
        console.error("[handleCreate] Fetch 请求失败:", fetchError);
        setError(`网络请求失败: ${fetchError instanceof Error ? fetchError.message : "未知错误"}`);
        setCreating(false);
        return;
      }

      if (!uploadResponse.ok) {
        console.error("[handleCreate] API 返回错误状态:", uploadResponse.status);

        // 尝试解析响应
        let errorMessage = "文件上传失败";
        try {
          const contentType = uploadResponse.headers.get("content-type");
          console.log("[handleCreate] 响应 Content-Type:", contentType);

          if (contentType && contentType.includes("application/json")) {
            const error = await uploadResponse.json();
            console.error("[handleCreate] 错误详情 (JSON):", error);
            errorMessage = error.error || errorMessage;
          } else {
            const textError = await uploadResponse.text();
            console.error("[handleCreate] 错误详情 (Text):", textError.substring(0, 500));
            errorMessage = `服务器返回非JSON响应 (${uploadResponse.status}): ${textError.substring(0, 100)}`;
          }
        } catch (parseError) {
          console.error("[handleCreate] 解析错误响应失败:", parseError);
          errorMessage = `上传失败 (${uploadResponse.status}): 无法解析错误信息`;
        }

        setError(errorMessage);
        setCreating(false);
        return;
      }

      let uploadResult;
      try {
        uploadResult = await uploadResponse.json();
        console.log("[handleCreate] 上传成功，响应数据:", uploadResult);
      } catch (jsonError) {
        console.error("[handleCreate] 解析成功响应失败:", jsonError);
        setError("上传成功但无法解析响应数据");
        setCreating(false);
        return;
      }

      const cloudbaseFileId = uploadResult.fileID || uploadResult.fileUrl;
      console.log("[handleCreate] ✅ 文件上传成功:", cloudbaseFileId);

      // 移除文件,只传递fileID和其他元数据
      formData.delete("file");
      formData.append("cloudbaseFileId", cloudbaseFileId);
      formData.append("fileName", fileName);
      formData.append("fileSize", file.size.toString());

      const result = await createRelease(formData);

      if (result.success) {
        setDialogOpen(false);
        loadReleases();
      } else {
        setError(result.error || "创建失败");
      }
    } catch (err) {
      console.error("[handleCreate] 错误:", err);
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  // 更新发布版本
  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;

    setCreating(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await updateRelease(editing.id, formData);

    if (result.success) {
      setEditDialogOpen(false);
      setEditing(null);
      loadReleases();
    } else {
      setError(result.error || "更新失败");
    }
    setCreating(false);
  }

  // 删除发布版本
  async function handleDelete(id: string) {
    setDeleting(id);
    const result = await deleteRelease(id);
    if (result.success) {
      loadReleases();
    } else {
      setError(result.error || "删除失败");
    }
    setDeleting(null);
  }

  // 切换状态
  async function handleToggle(id: string, currentStatus: boolean) {
    setToggling(id);
    const result = await toggleReleaseStatus(id, !currentStatus);
    if (result.success) {
      loadReleases();
    } else {
      setError(result.error || "切换状态失败");
    }
    setToggling(null);
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">发布版本</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理应用的发布版本，支持多平台（iOS、Android、Windows、macOS、Linux）
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadReleases} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            刷新
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                新增版本
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>新增发布版本</DialogTitle>
                <DialogDescription>
                  上传新版本安装包
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="version">版本号 *</Label>
                    <Input
                      id="version"
                      name="version"
                      placeholder="如 1.0.0"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="platform">平台 *</Label>
                    <Select
                      name="platform"
                      defaultValue="android"
                      onValueChange={(value) => setSelectedPlatformForCreate(value as Platform)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLATFORMS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            <span className="flex items-center gap-2">
                              {p.icon}
                              {p.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 变体选择（仅对 Windows/macOS/Linux 显示） */}
                {VARIANTS[selectedPlatformForCreate]?.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="variant">架构/格式</Label>
                    <Select name="variant">
                      <SelectTrigger>
                        <SelectValue placeholder="选择架构或格式（可选）" />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIANTS[selectedPlatformForCreate].map((v) => (
                          <SelectItem key={v.value} value={v.value}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      为不同架构上传单独的安装包
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="file">安装包文件 *</Label>
                  <Input
                    id="file"
                    name="file"
                    type="file"
                    accept=".apk,.ipa,.exe,.dmg,.deb,.rpm,.AppImage,.zip"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    支持 APK、IPA、EXE、DMG、DEB、RPM 等格式
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="releaseNotes">更新说明</Label>
                  <Textarea
                    id="releaseNotes"
                    name="releaseNotes"
                    placeholder="本次更新的内容..."
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>立即启用</Label>
                    <div className="flex items-center h-10">
                      <input type="hidden" name="isActive" value="false" />
                      <Switch
                        name="isActive"
                        defaultChecked={true}
                        onCheckedChange={(checked) => {
                          const form = document.querySelector("form");
                          if (form) {
                            const hidden = form.querySelector(
                              'input[name="isActive"][type="hidden"]'
                            ) as HTMLInputElement;
                            if (hidden) hidden.value = String(checked);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>强制更新</Label>
                    <div className="flex items-center h-10">
                      <input type="hidden" name="isMandatory" value="false" />
                      <Switch
                        name="isMandatory"
                        defaultChecked={false}
                        onCheckedChange={(checked) => {
                          const form = document.querySelector("form");
                          if (form) {
                            const hidden = form.querySelector(
                              'input[name="isMandatory"][type="hidden"]'
                            ) as HTMLInputElement;
                            if (hidden) hidden.value = String(checked);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        上传中...
                      </>
                    ) : (
                      "创建"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 搜索和筛选栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* 搜索框 */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索版本号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* 平台筛选 */}
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className="flex items-center gap-2">
                      {p.icon}
                      {p.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 状态筛选 */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">已启用</SelectItem>
                <SelectItem value="inactive">已禁用</SelectItem>
              </SelectContent>
            </Select>

            {/* 清除筛选按钮 */}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                清除筛选
              </Button>
            )}
          </div>

          {/* 筛选结果统计 */}
          {hasFilters && (
            <div className="mt-3 text-sm text-muted-foreground">
              找到 {filteredReleases.length} 条结果（共 {releases.length} 条）
            </div>
          )}
        </CardContent>
      </Card>

      {/* 发布版本列表 */}
      <Card>
        <CardHeader>
          <CardTitle>版本列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredReleases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {hasFilters ? "没有符合筛选条件的版本" : "暂无发布版本，点击\"新增版本\"开始添加"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">版本号</TableHead>
                  <TableHead className="w-24">平台</TableHead>
                  <TableHead className="w-24">大小</TableHead>
                  <TableHead className="w-36">发布时间</TableHead>
                  <TableHead className="w-24">强制更新</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-32">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReleases.map((release) => (
                  <TableRow key={release.id}>
                    <TableCell className="font-mono font-medium">
                      v{release.version}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="flex items-center gap-2">
                          {getPlatformIcon(release.platform)}
                          {getPlatformLabel(release.platform)}
                        </span>
                        {release.variant && (
                          <span className="text-xs text-muted-foreground ml-6">
                            {getVariantLabel(release.platform, release.variant)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <HardDrive className="h-3 w-3" />
                        {formatFileSize(release.file_size)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {release.created_at
                          ? new Date(release.created_at).toLocaleString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {release.is_mandatory ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> 强制
                        </Badge>
                      ) : (
                        <Badge variant="outline">可选</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={
                          release.is_active
                            ? "text-green-600"
                            : "text-muted-foreground"
                        }
                        onClick={() => handleToggle(release.id, release.is_active)}
                        disabled={toggling === release.id}
                      >
                        {toggling === release.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : release.is_active ? (
                          <>
                            <Eye className="h-4 w-4 mr-1" /> 启用
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-4 w-4 mr-1" /> 禁用
                          </>
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* 下载按钮 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(release.file_url, "_blank")}
                          title="下载"
                        >
                          <Download className="h-4 w-4" />
                        </Button>

                        {/* 编辑按钮 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(release);
                            setEditDialogOpen(true);
                          }}
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        {/* 删除按钮 */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确认删除</AlertDialogTitle>
                              <AlertDialogDescription>
                                确定要删除版本 "v{release.version}" ({getPlatformLabel(release.platform)}) 吗？此操作不可恢复。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(release.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                {deleting === release.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
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
          )}
        </CardContent>
      </Card>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑发布版本</DialogTitle>
            <DialogDescription>
              修改版本信息（版本号和平台不可更改）
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>版本号</Label>
                  <Input value={`v${editing.version}`} disabled />
                </div>

                <div className="space-y-2">
                  <Label>平台</Label>
                  <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50">
                    {getPlatformIcon(editing.platform)}
                    <span className="ml-2">{getPlatformLabel(editing.platform)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-releaseNotes">更新说明</Label>
                <Textarea
                  id="edit-releaseNotes"
                  name="releaseNotes"
                  defaultValue={editing.release_notes || ""}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>状态</Label>
                  <div className="flex items-center h-10">
                    <input
                      type="hidden"
                      name="isActive"
                      id="edit-isActive-hidden"
                      defaultValue={String(editing.is_active)}
                    />
                    <Switch
                      defaultChecked={editing.is_active}
                      onCheckedChange={(checked) => {
                        const hidden = document.getElementById(
                          "edit-isActive-hidden"
                        ) as HTMLInputElement;
                        if (hidden) hidden.value = String(checked);
                      }}
                    />
                    <span className="ml-2 text-sm text-muted-foreground">
                      {editing.is_active ? "已启用" : "已禁用"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>强制更新</Label>
                  <div className="flex items-center h-10">
                    <input
                      type="hidden"
                      name="isMandatory"
                      id="edit-isMandatory-hidden"
                      defaultValue={String(editing.is_mandatory)}
                    />
                    <Switch
                      defaultChecked={editing.is_mandatory}
                      onCheckedChange={(checked) => {
                        const hidden = document.getElementById(
                          "edit-isMandatory-hidden"
                        ) as HTMLInputElement;
                        if (hidden) hidden.value = String(checked);
                      }}
                    />
                    <span className="ml-2 text-sm text-muted-foreground">
                      {editing.is_mandatory ? "强制" : "可选"}
                    </span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false);
                    setEditing(null);
                  }}
                >
                  取消
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    "保存"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
