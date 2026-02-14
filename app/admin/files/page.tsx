"use client";

import { useState, useEffect } from "react";
import {
  listStorageFiles,
  deleteStorageFile,
  renameStorageFile,
  renameCloudBaseFile,
  downloadStorageFile,
  getCloudBaseFileUrl,
  type StorageFile,
} from "@/actions/admin-ads";
import {
  listReleaseFiles,
  deleteReleaseFile,
  downloadReleaseFile,
  type ReleaseFile,
} from "@/actions/admin-releases";
import {
  listSocialLinkFiles,
  deleteSocialLinkFile,
  type SocialLinkFile,
} from "@/actions/admin-social-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Cloud,
  Database,
  Image as ImageIcon,
  Video,
  FileIcon,
  Eye,
  Pencil,
  Trash2,
  Download,
  Package,
  Smartphone,
  Monitor,
  Apple,
  Link as LinkIcon,
} from "lucide-react";

export default function FilesManagementPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adsFiles, setAdsFiles] = useState<StorageFile[]>([]);
  const [releaseFiles, setReleaseFiles] = useState<ReleaseFile[]>([]);
  const [socialFiles, setSocialFiles] = useState<SocialLinkFile[]>([]);

  // 预览状态
  const [previewFile, setPreviewFile] = useState<StorageFile | null>(null);
  const [actualPreviewUrl, setActualPreviewUrl] = useState<string>("");

  // 重命名状态
  const [renameFile, setRenameFile] = useState<StorageFile | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [renaming, setRenaming] = useState(false);

  // 删除状态
  const [deleteFile, setDeleteFile] = useState<StorageFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 下载状态
  const [downloading, setDownloading] = useState<string | null>(null);

  async function loadFiles() {
    setLoading(true);
    setError(null);
    try {
      // 并行加载广告文件、发布版本文件和社交链接图标文件
      const [adsResult, releasesResult, socialResult] = await Promise.all([
        listStorageFiles(),
        listReleaseFiles(),
        listSocialLinkFiles(),
      ]);

      if (adsResult.success) {
        setAdsFiles(adsResult.files || []);
      }

      if (releasesResult.success) {
        setReleaseFiles(releasesResult.files || []);
      }

      if (socialResult.success) {
        setSocialFiles(socialResult.files || []);
      }

      if (!adsResult.success && !releasesResult.success && !socialResult.success) {
        setError(adsResult.error || releasesResult.error || socialResult.error || "加载失败");
      }
    } catch (err) {
      setError("加载文件列表失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, []);

  // 当预览CloudBase文件时，实时获取新的临时URL
  useEffect(() => {
    if (!previewFile) {
      setActualPreviewUrl("");
      return;
    }

    // 如果是CloudBase文件且有fileId，获取新的临时URL
    if (previewFile.source === "cloudbase" && previewFile.fileId && previewFile.fileId.startsWith("cloud://")) {
      getCloudBaseFileUrl(previewFile.fileId).then((result) => {
        if (result.success && result.data) {
          setActualPreviewUrl(result.data.url);
        } else {
          // 如果获取失败，使用原始URL
          setActualPreviewUrl(previewFile.url);
          console.error("Failed to get CloudBase temp URL:", result.error);
        }
      });
    } else {
      // Supabase文件或没有fileId的CloudBase文件，直接使用原始URL
      setActualPreviewUrl(previewFile.url);
    }
  }, [previewFile]);

  // 处理重命名
  async function handleRename() {
    if (!renameFile || !newFileName.trim()) return;

    setRenaming(true);
    setError(null);

    try {
      let result;
      if (renameFile.source === "cloudbase" && renameFile.fileId && renameFile.adId) {
        // CloudBase 重命名需要 fileId 和 adId
        result = await renameCloudBaseFile(
          renameFile.name,
          newFileName.trim(),
          renameFile.fileId,
          renameFile.adId
        );
      } else {
        // Supabase 重命名
        result = await renameStorageFile(
          renameFile.name,
          newFileName.trim(),
          renameFile.source
        );
      }

      if (result.success) {
        setRenameFile(null);
        setNewFileName("");
        loadFiles();
      } else {
        setError(result.error || "重命名失败");
      }
    } catch (err) {
      setError("重命名失败");
    } finally {
      setRenaming(false);
    }
  }

  // 处理删除
  async function handleDelete() {
    if (!deleteFile) return;

    setDeleting(true);
    setError(null);

    try {
      const result = await deleteStorageFile(
        deleteFile.name,
        deleteFile.source,
        deleteFile.fileId,
        deleteFile.adId
      );

      if (result.success) {
        setDeleteFile(null);
        loadFiles();
      } else {
        setError(result.error || "删除失败");
      }
    } catch (err) {
      setError("删除失败");
    } finally {
      setDeleting(false);
    }
  }

  // 处理下载
  async function handleDownload(file: StorageFile) {
    setDownloading(file.name);
    setError(null);

    try {
      const result = await downloadStorageFile(
        file.name,
        file.source,
        file.fileId
      );

      if (result.success && result.data) {
        // 将 Base64 转换为 Blob 并触发下载
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: result.contentType || "application/octet-stream" });

        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.fileName || file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        setError(result.error || "下载失败");
      }
    } catch (err) {
      setError("下载失败");
    } finally {
      setDownloading(null);
    }
  }

  // 打开重命名对话框
  function openRenameDialog(file: StorageFile) {
    setRenameFile(file);
    // 默认使用原文件名（不含扩展名部分可编辑）
    setNewFileName(file.name);
  }

  // 检查是否可以重命名（CloudBase 需要有 fileId）
  function canRename(file: StorageFile): boolean {
    if (file.source === "supabase") {
      return true;
    }
    // CloudBase 需要有效的 fileId 才能重命名
    return !!(file.fileId && file.fileId.startsWith("cloud://") && file.adId);
  }

  function getFileIcon(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) {
      return <ImageIcon className="h-4 w-4" />;
    }
    if (["mp4", "webm", "mov", "avi"].includes(ext || "")) {
      return <Video className="h-4 w-4" />;
    }
    return <FileIcon className="h-4 w-4" />;
  }

  function getFileType(fileName: string): "image" | "video" | "other" {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) {
      return "image";
    }
    if (["mp4", "webm", "mov", "avi"].includes(ext || "")) {
      return "video";
    }
    return "other";
  }

  function formatFileSize(bytes?: number) {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function FileTable({ files, source }: { files: StorageFile[]; source: "supabase" | "cloudbase" }) {
    if (files.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          {source === "cloudbase"
            ? "暂无文件（CloudBase 文件来自广告记录）"
            : "暂无文件"}
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">预览</TableHead>
            <TableHead>文件名</TableHead>
            <TableHead className="w-24">大小</TableHead>
            <TableHead className="w-40">修改时间</TableHead>
            <TableHead className="w-32">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file, index) => {
            const fileType = getFileType(file.name);
            return (
              <TableRow key={`${file.name}-${index}`}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setPreviewFile(file)}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    title="点击预览"
                  >
                    {fileType === "image" ? (
                      file.source === "cloudbase" ? (
                        // CloudBase 文件使用占位符，因为临时 URL 会过期
                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                      ) : (
                        // Supabase 文件直接显示，因为使用的是公开 URL
                        <img
                          src={file.url}
                          alt={file.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )
                    ) : fileType === "video" ? (
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center">
                        <Video className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center">
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </button>
                </TableCell>
                <TableCell className="font-mono text-sm truncate max-w-xs">
                  {file.name}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatFileSize(file.size)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {file.lastModified
                    ? new Date(file.lastModified).toLocaleString("zh-CN")
                    : "-"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {/* 预览按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewFile(file)}
                      title="预览"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    {/* 下载按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(file)}
                      disabled={downloading === file.name || (source === "cloudbase" && !file.fileId)}
                      title="下载"
                    >
                      {downloading === file.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>

                    {/* 重命名按钮 - Supabase 和 CloudBase（需要有 fileId） */}
                    {canRename(file) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openRenameDialog(file)}
                        title="重命名"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}

                    {/* 外部链接按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(file.url, "_blank")}
                      title="在新窗口打开"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>

                    {/* 删除按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteFile(file)}
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  // 获取平台图标
  function getPlatformIcon(platform?: string) {
    switch (platform) {
      case "ios":
      case "macos":
        return <Apple className="h-4 w-4" />;
      case "android":
        return <Smartphone className="h-4 w-4" />;
      case "windows":
      case "linux":
        return <Monitor className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  }

  // 获取平台名称
  function getPlatformLabel(platform?: string) {
    switch (platform) {
      case "ios": return "iOS";
      case "android": return "Android";
      case "windows": return "Windows";
      case "macos": return "macOS";
      case "linux": return "Linux";
      default: return platform || "-";
    }
  }

  // 发布版本文件表格
  function ReleaseFileTable({ files, source }: { files: ReleaseFile[]; source: "supabase" | "cloudbase" }) {
    if (files.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          暂无应用文件
        </div>
      );
    }

    // 处理发布文件下载
    async function handleReleaseDownload(file: ReleaseFile) {
      setDownloading(file.name);
      setError(null);

      try {
        const result = await downloadReleaseFile(
          file.name,
          file.source,
          file.fileId
        );

        if (result.success && result.data) {
          const byteCharacters = atob(result.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: result.contentType || "application/octet-stream" });

          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = result.fileName || file.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          setError(result.error || "下载失败");
        }
      } catch (err) {
        setError("下载失败");
      } finally {
        setDownloading(null);
      }
    }

    // 处理发布文件删除
    async function handleReleaseDelete(file: ReleaseFile) {
      if (!confirm(`确定要删除文件 "${file.name}" 吗？此操作将同时删除关联的版本记录。`)) {
        return;
      }

      setDeleting(true);
      setError(null);

      try {
        const result = await deleteReleaseFile(
          file.name,
          file.source,
          file.fileId,
          file.releaseId
        );

        if (result.success) {
          loadFiles();
        } else {
          setError(result.error || "删除失败");
        }
      } catch (err) {
        setError("删除失败");
      } finally {
        setDeleting(false);
      }
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">平台</TableHead>
            <TableHead className="w-24">版本</TableHead>
            <TableHead>文件名</TableHead>
            <TableHead className="w-24">大小</TableHead>
            <TableHead className="w-40">上传时间</TableHead>
            <TableHead className="w-28">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file, index) => (
            <TableRow key={`${file.name}-${index}`}>
              <TableCell>
                <span className="flex items-center gap-2">
                  {getPlatformIcon(file.platform)}
                </span>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {file.version ? `v${file.version}` : "-"}
              </TableCell>
              <TableCell className="font-mono text-sm truncate max-w-xs">
                {file.name}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatFileSize(file.size)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {file.lastModified
                  ? new Date(file.lastModified).toLocaleString("zh-CN")
                  : "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {/* 下载按钮 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleReleaseDownload(file)}
                    disabled={downloading === file.name || (source === "cloudbase" && !file.fileId)}
                    title="下载"
                  >
                    {downloading === file.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>

                  {/* 外部链接按钮 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(file.url, "_blank")}
                    title="在新窗口打开"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>

                  {/* 删除按钮 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleReleaseDelete(file)}
                    disabled={deleting}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  // 社交链接图标文件表格
  function SocialIconFileTable({ files, source }: { files: SocialLinkFile[]; source: "supabase" | "cloudbase" }) {
    if (files.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          暂无图标文件
        </div>
      );
    }

    // 处理社交链接图标文件删除
    async function handleSocialFileDelete(file: SocialLinkFile) {
      if (!confirm(`确定要删除文件 "${file.name}" 吗？此操作将同时删除关联的社交链接记录。`)) {
        return;
      }

      setDeleting(true);
      setError(null);

      try {
        const result = await deleteSocialLinkFile(
          file.name,
          file.source,
          file.fileId,
          file.linkId
        );

        if (result.success) {
          loadFiles();
        } else {
          setError(result.error || "删除失败");
        }
      } catch (err) {
        setError("删除失败");
      } finally {
        setDeleting(false);
      }
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">预览</TableHead>
            <TableHead>文件名</TableHead>
            <TableHead className="w-24">大小</TableHead>
            <TableHead className="w-40">创建时间</TableHead>
            <TableHead className="w-28">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file, index) => (
            <TableRow key={`${file.name}-${index}`}>
              <TableCell>
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-12 h-12 object-contain rounded cursor-pointer hover:opacity-80"
                  onClick={() => window.open(file.url, "_blank")}
                  title="点击预览"
                />
              </TableCell>
              <TableCell className="font-mono text-sm truncate max-w-xs">
                {file.name}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatFileSize(file.size)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {file.lastModified
                  ? new Date(file.lastModified).toLocaleString("zh-CN")
                  : "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {/* 外部链接按钮 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(file.url, "_blank")}
                    title="在新窗口打开"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>

                  {/* 删除按钮 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleSocialFileDelete(file)}
                    disabled={deleting}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文件管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看和管理当前环境的云存储文件
          </p>
        </div>
        <Button variant="outline" onClick={loadFiles} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          刷新
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 统计卡片 */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">广告文件</CardTitle>
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adsFiles.length}</div>
              <p className="text-xs text-muted-foreground">当前环境</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">应用文件</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{releaseFiles.length}</div>
              <p className="text-xs text-muted-foreground">当前环境</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">图标文件</CardTitle>
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{socialFiles.length}</div>
              <p className="text-xs text-muted-foreground">当前环境</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 文件列表 */}
      <Tabs defaultValue="ads">
        <TabsList className="grid w-full grid-cols-3 gap-2">
          <TabsTrigger value="ads" className="gap-1">
            <ImageIcon className="h-4 w-4" />
            广告文件
            <Badge variant="secondary" className="ml-1">
              {adsFiles.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="releases" className="gap-1">
            <Package className="h-4 w-4" />
            应用文件
            <Badge variant="secondary" className="ml-1">
              {releaseFiles.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="social" className="gap-1">
            <LinkIcon className="h-4 w-4" />
            图标文件
            <Badge variant="secondary" className="ml-1">
              {socialFiles.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ads">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                广告文件
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <FileTable files={adsFiles} source={adsFiles[0]?.source || "supabase"} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="releases">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                应用文件
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ReleaseFileTable files={releaseFiles} source={releaseFiles[0]?.source || "supabase"} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="social">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                社交链接图标
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <SocialIconFileTable files={socialFiles} source={socialFiles[0]?.source || "supabase"} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 预览对话框 */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewFile && getFileIcon(previewFile.name)}
              {previewFile?.name}
            </DialogTitle>
            <DialogDescription>
              {previewFile?.source === "supabase" ? "Supabase Storage" : "CloudBase Storage"}
              {previewFile?.size && ` · ${formatFileSize(previewFile.size)}`}
            </DialogDescription>
          </DialogHeader>

          {previewFile && (
            <div className="space-y-4">
              {/* 媒体预览 */}
              <div className="rounded-lg overflow-hidden border bg-slate-50 dark:bg-slate-900 flex items-center justify-center min-h-[300px]">
                {getFileType(previewFile.name) === "image" ? (
                  <img
                    src={actualPreviewUrl || previewFile.url}
                    alt={previewFile.name}
                    className="max-w-full max-h-[60vh] object-contain"
                  />
                ) : getFileType(previewFile.name) === "video" ? (
                  <video
                    src={actualPreviewUrl || previewFile.url}
                    controls
                    autoPlay
                    className="max-w-full max-h-[60vh]"
                  />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileIcon className="h-16 w-16 mx-auto mb-4" />
                    <p>此文件类型不支持预览</p>
                  </div>
                )}
              </div>

              {/* 文件 URL */}
              <div className="text-sm">
                <span className="text-muted-foreground">文件地址：</span>
                <a
                  href={actualPreviewUrl || previewFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline ml-1 break-all"
                >
                  {actualPreviewUrl || previewFile.url}
                </a>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewFile(null)}>
              关闭
            </Button>
            <Button
              variant="outline"
              onClick={() => previewFile && handleDownload(previewFile)}
              disabled={downloading === previewFile?.name || (previewFile?.source === "cloudbase" && !previewFile?.fileId)}
            >
              {downloading === previewFile?.name ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              下载文件
            </Button>
            <Button onClick={() => window.open(actualPreviewUrl || previewFile?.url, "_blank")}>
              <ExternalLink className="h-4 w-4 mr-2" />
              在新窗口打开
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名对话框 */}
      <Dialog open={!!renameFile} onOpenChange={(open) => !open && setRenameFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名文件</DialogTitle>
            <DialogDescription>
              输入新的文件名（包含扩展名）
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>原文件名</Label>
              <Input value={renameFile?.name || ""} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newFileName">新文件名</Label>
              <Input
                id="newFileName"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="输入新文件名"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameFile(null);
                setNewFileName("");
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleRename}
              disabled={renaming || !newFileName.trim() || newFileName === renameFile?.name}
            >
              {renaming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  重命名中...
                </>
              ) : (
                "确认重命名"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteFile} onOpenChange={(open) => !open && setDeleteFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除文件 &quot;{deleteFile?.name}&quot; 吗？
              <br />
              <span className="text-red-600">
                此操作不可恢复。
                {deleteFile?.source === "cloudbase" && deleteFile?.adId && (
                  <>
                    <br />
                    同时会删除 CloudBase 中关联的广告记录。
                  </>
                )}
                {deleteFile?.source === "supabase" && (
                  <>
                    <br />
                    如果有广告正在使用此文件，将无法显示。
                  </>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
