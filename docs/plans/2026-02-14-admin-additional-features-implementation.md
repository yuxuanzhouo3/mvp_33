# 管理后台附加功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为管理后台添加5个完整功能模块(社交链接、广告、文件、发布版本、系统设置),完全支持双数据库架构

**Architecture:** 扩展现有的数据库适配器模式,为CloudBase和Supabase适配器添加新功能方法。创建对应的Server Actions和前端页面。直接复制模板项目的UI代码保持界面一致。

**Tech Stack:** Next.js 16, TypeScript, CloudBase SDK, Supabase, shadcn/ui, Server Actions

---

## Task 1: 扩展类型定义

**Files:**
- Modify: `lib/admin/types.ts`

**Step 1: 添加社交链接类型**

在`lib/admin/types.ts`文件末尾添加:

```typescript
// ==================== 社交链接管理 ====================

export interface SocialLink {
  id: string;
  icon: string;
  title: string;
  description?: string;
  url: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSocialLinkData {
  icon: string;
  title: string;
  description?: string;
  url: string;
  order: number;
}

export interface UpdateSocialLinkData {
  icon?: string;
  title?: string;
  description?: string;
  url?: string;
  order?: number;
}
```

**Step 2: 添加广告管理类型**

继续在文件末尾添加:

```typescript
// ==================== 广告管理 ====================

export interface Advertisement {
  id: string;
  title: string;
  type: 'image' | 'video';
  position: 'top' | 'bottom' | 'left' | 'right' | 'bottom-left' | 'bottom-right' | 'sidebar';
  fileUrl: string;
  fileUrlCn?: string;
  fileUrlIntl?: string;
  linkUrl?: string;
  priority: number;
  status: 'active' | 'inactive';
  file_size?: number;
  startDate?: string;
  endDate?: string;
  created_at: string;
}

export interface CreateAdData {
  title: string;
  type: 'image' | 'video';
  position: string;
  fileUrl: string;
  fileUrlCn?: string;
  fileUrlIntl?: string;
  linkUrl?: string;
  priority: number;
  status: 'active' | 'inactive';
  file_size?: number;
  startDate?: string;
  endDate?: string;
}

export interface AdStats {
  total: number;
  active: number;
  inactive: number;
  byType: {
    image: number;
    video: number;
  };
}
```

**Step 3: 添加发布版本类型**

继续添加:

```typescript
// ==================== 发布版本管理 ====================

export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux';
export type Variant = 'x64' | 'x86' | 'arm64' | 'intel' | 'm' | 'deb' | 'rpm' | 'appimage' | 'snap' | 'flatpak' | 'aur';

export interface AppRelease {
  id: string;
  version: string;
  platform: Platform;
  variant?: Variant;
  file_url: string;
  file_name: string;
  file_size: number;
  release_notes?: string;
  is_active: boolean;
  is_mandatory: boolean;
  created_at: string;
}

export interface CreateReleaseData {
  version: string;
  platform: Platform;
  variant?: Variant;
  file_url: string;
  file_name: string;
  file_size: number;
  release_notes?: string;
  is_active: boolean;
  is_mandatory: boolean;
}
```

**Step 4: 添加文件管理类型**

继续添加:

```typescript
// ==================== 文件管理 ====================

export interface StorageFile {
  name: string;
  url: string;
  size?: number;
  lastModified?: string;
  source: 'cloudbase' | 'supabase';
  fileId?: string;
  adId?: string;
}

export interface ReleaseFile extends StorageFile {
  platform?: Platform;
  version?: string;
  releaseId?: string;
}

export interface SocialLinkFile extends StorageFile {
  linkId?: string;
}
```

**Step 5: 提交更改**

```bash
git add lib/admin/types.ts
git commit -m "$(cat <<'EOF'
feat(admin): 添加社交链接、广告、发布版本和文件管理的类型定义

添加完整的TypeScript类型定义以支持新功能模块

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 扩展数据库适配器接口

**Files:**
- Modify: `lib/admin/types.ts`

**Step 1: 在AdminDatabaseAdapter接口中添加社交链接方法**

在`AdminDatabaseAdapter`接口中添加:

```typescript
// 社交链接相关
listSocialLinks(): Promise<SocialLink[]>;
getSocialLinkById(id: string): Promise<SocialLink | null>;
createSocialLink(data: CreateSocialLinkData): Promise<SocialLink>;
updateSocialLink(id: string, data: UpdateSocialLinkData): Promise<SocialLink>;
deleteSocialLink(id: string): Promise<void>;
updateSocialLinksOrder(updates: Array<{ id: string; order: number }>): Promise<void>;
```

**Step 2: 添加广告管理方法**

继续在接口中添加:

```typescript
// 广告相关
listAds(filters: { limit?: number; offset?: number }): Promise<{ items: Advertisement[]; total: number }>;
getAdById(id: string): Promise<Advertisement | null>;
createAd(data: CreateAdData): Promise<Advertisement>;
updateAd(id: string, data: Partial<CreateAdData>): Promise<Advertisement>;
deleteAd(id: string): Promise<void>;
toggleAdStatus(id: string): Promise<Advertisement>;
getAdStats(): Promise<AdStats>;
```

**Step 3: 添加发布版本方法**

继续添加:

```typescript
// 发布版本相关
listReleases(): Promise<AppRelease[]>;
getReleaseById(id: string): Promise<AppRelease | null>;
createRelease(data: CreateReleaseData): Promise<AppRelease>;
updateRelease(id: string, data: Partial<CreateReleaseData>): Promise<AppRelease>;
deleteRelease(id: string): Promise<void>;
toggleReleaseStatus(id: string, isActive: boolean): Promise<AppRelease>;
```

**Step 4: 添加文件管理方法**

继续添加:

```typescript
// 文件管理相关
listStorageFiles(): Promise<StorageFile[]>;
deleteStorageFile(fileName: string, fileId?: string, adId?: string): Promise<void>;
renameStorageFile(oldName: string, newName: string): Promise<void>;
downloadStorageFile(fileName: string, fileId?: string): Promise<{ data: string; contentType: string; fileName: string }>;
```

**Step 5: 提交更改**

```bash
git add lib/admin/types.ts
git commit -m "$(cat <<'EOF'
feat(admin): 扩展数据库适配器接口以支持新功能

在AdminDatabaseAdapter接口中添加社交链接、广告、发布版本和文件管理的方法定义

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 实现Supabase适配器 - 社交链接功能

**Files:**
- Modify: `lib/admin/supabase-adapter.ts`

**Step 1: 实现listSocialLinks方法**

在`SupabaseAdminAdapter`类中添加:

```typescript
async listSocialLinks(): Promise<SocialLink[]> {
  console.log('[SupabaseAdapter] 获取社交链接列表');

  const { data, error } = await this.supabase
    .from('social_links')
    .select('*')
    .order('order', { ascending: true });

  if (error) {
    console.error('[SupabaseAdapter] 获取社交链接失败:', error);
    throw new Error(`获取社交链接失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 获取到', data?.length || 0, '个社交链接');
  return data || [];
}
```

**Step 2: 实现getSocialLinkById方法**

```typescript
async getSocialLinkById(id: string): Promise<SocialLink | null> {
  console.log('[SupabaseAdapter] 获取社交链接:', id);

  const { data, error } = await this.supabase
    .from('social_links')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.log('[SupabaseAdapter] 社交链接不存在:', id);
      return null;
    }
    console.error('[SupabaseAdapter] 获取社交链接失败:', error);
    throw new Error(`获取社交链接失败: ${error.message}`);
  }

  return data;
}
```

**Step 3: 实现createSocialLink方法**

```typescript
async createSocialLink(data: CreateSocialLinkData): Promise<SocialLink> {
  console.log('[SupabaseAdapter] 创建社交链接:', data);

  const { data: result, error } = await this.supabase
    .from('social_links')
    .insert({
      icon: data.icon,
      title: data.title,
      description: data.description,
      url: data.url,
      order: data.order,
    })
    .select()
    .single();

  if (error) {
    console.error('[SupabaseAdapter] 创建社交链接失败:', error);
    throw new Error(`创建社交链接失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 社交链接创建成功:', result.id);
  return result;
}
```

**Step 4: 实现updateSocialLink方法**

```typescript
async updateSocialLink(id: string, data: UpdateSocialLinkData): Promise<SocialLink> {
  console.log('[SupabaseAdapter] 更新社交链接:', id, data);

  const { data: result, error } = await this.supabase
    .from('social_links')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[SupabaseAdapter] 更新社交链接失败:', error);
    throw new Error(`更新社交链接失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 社交链接更新成功');
  return result;
}
```

**Step 5: 实现deleteSocialLink和updateSocialLinksOrder方法**

```typescript
async deleteSocialLink(id: string): Promise<void> {
  console.log('[SupabaseAdapter] 删除社交链接:', id);

  const { error } = await this.supabase
    .from('social_links')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[SupabaseAdapter] 删除社交链接失败:', error);
    throw new Error(`删除社交链接失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 社交链接删除成功');
}

async updateSocialLinksOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
  console.log('[SupabaseAdapter] 更新社交链接排序:', updates.length, '个');

  for (const update of updates) {
    const { error } = await this.supabase
      .from('social_links')
      .update({ order: update.order })
      .eq('id', update.id);

    if (error) {
      console.error('[SupabaseAdapter] 更新排序失败:', error);
      throw new Error(`更新排序失败: ${error.message}`);
    }
  }

  console.log('[SupabaseAdapter] 排序更新成功');
}
```

**Step 6: 提交更改**

```bash
git add lib/admin/supabase-adapter.ts
git commit -m "$(cat <<'EOF'
feat(admin): 实现Supabase适配器的社交链接功能

实现社交链接的CRUD操作和排序功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 实现Supabase适配器 - 广告管理功能

**Files:**
- Modify: `lib/admin/supabase-adapter.ts`

**Step 1: 实现listAds方法**

在`SupabaseAdminAdapter`类中添加:

```typescript
async listAds(filters: { limit?: number; offset?: number }): Promise<{ items: Advertisement[]; total: number }> {
  console.log('[SupabaseAdapter] 获取广告列表:', filters);

  let query = this.supabase
    .from('advertisements')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[SupabaseAdapter] 获取广告列表失败:', error);
    throw new Error(`获取广告列表失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 获取到', data?.length || 0, '个广告，总数:', count);
  return { items: data || [], total: count || 0 };
}
```

**Step 2: 实现createAd方法**

```typescript
async createAd(data: CreateAdData): Promise<Advertisement> {
  console.log('[SupabaseAdapter] 创建广告:', data.title);

  const { data: result, error } = await this.supabase
    .from('advertisements')
    .insert({
      title: data.title,
      type: data.type,
      position: data.position,
      file_url: data.fileUrl,
      file_url_cn: data.fileUrlCn,
      file_url_intl: data.fileUrlIntl,
      link_url: data.linkUrl,
      priority: data.priority,
      status: data.status,
      file_size: data.file_size,
      start_date: data.startDate,
      end_date: data.endDate,
    })
    .select()
    .single();

  if (error) {
    console.error('[SupabaseAdapter] 创建广告失败:', error);
    throw new Error(`创建广告失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 广告创建成功:', result.id);
  return result;
}
```

**Step 3: 实现updateAd和deleteAd方法**

```typescript
async updateAd(id: string, data: Partial<CreateAdData>): Promise<Advertisement> {
  console.log('[SupabaseAdapter] 更新广告:', id);

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.position !== undefined) updateData.position = data.position;
  if (data.linkUrl !== undefined) updateData.link_url = data.linkUrl;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.startDate !== undefined) updateData.start_date = data.startDate;
  if (data.endDate !== undefined) updateData.end_date = data.endDate;

  const { data: result, error } = await this.supabase
    .from('advertisements')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[SupabaseAdapter] 更新广告失败:', error);
    throw new Error(`更新广告失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 广告更新成功');
  return result;
}

async deleteAd(id: string): Promise<void> {
  console.log('[SupabaseAdapter] 删除广告:', id);

  const { error } = await this.supabase
    .from('advertisements')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[SupabaseAdapter] 删除广告失败:', error);
    throw new Error(`删除广告失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 广告删除成功');
}
```

**Step 4: 实现toggleAdStatus和getAdStats方法**

```typescript
async toggleAdStatus(id: string): Promise<Advertisement> {
  console.log('[SupabaseAdapter] 切换广告状态:', id);

  const ad = await this.getAdById(id);
  if (!ad) {
    throw new Error('广告不存在');
  }

  const newStatus = ad.status === 'active' ? 'inactive' : 'active';
  return this.updateAd(id, { status: newStatus });
}

async getAdStats(): Promise<AdStats> {
  console.log('[SupabaseAdapter] 获取广告统计');

  const { data, error } = await this.supabase
    .from('advertisements')
    .select('status, type');

  if (error) {
    console.error('[SupabaseAdapter] 获取广告统计失败:', error);
    throw new Error(`获取广告统计失败: ${error.message}`);
  }

  const stats: AdStats = {
    total: data?.length || 0,
    active: data?.filter(ad => ad.status === 'active').length || 0,
    inactive: data?.filter(ad => ad.status === 'inactive').length || 0,
    byType: {
      image: data?.filter(ad => ad.type === 'image').length || 0,
      video: data?.filter(ad => ad.type === 'video').length || 0,
    },
  };

  console.log('[SupabaseAdapter] 广告统计:', stats);
  return stats;
}

async getAdById(id: string): Promise<Advertisement | null> {
  const { data, error } = await this.supabase
    .from('advertisements')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`获取广告失败: ${error.message}`);
  }

  return data;
}
```

**Step 5: 提交更改**

```bash
git add lib/admin/supabase-adapter.ts
git commit -m "$(cat <<'EOF'
feat(admin): 实现Supabase适配器的广告管理功能

实现广告的CRUD操作、状态切换和统计功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 实现Supabase适配器 - 发布版本功能

**Files:**
- Modify: `lib/admin/supabase-adapter.ts`

**Step 1: 实现listReleases方法**

```typescript
async listReleases(): Promise<AppRelease[]> {
  console.log('[SupabaseAdapter] 获取发布版本列表');

  const { data, error } = await this.supabase
    .from('releases')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[SupabaseAdapter] 获取发布版本失败:', error);
    throw new Error(`获取发布版本失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 获取到', data?.length || 0, '个版本');
  return data || [];
}
```

**Step 2: 实现createRelease方法**

```typescript
async createRelease(data: CreateReleaseData): Promise<AppRelease> {
  console.log('[SupabaseAdapter] 创建发布版本:', data.version);

  const { data: result, error } = await this.supabase
    .from('releases')
    .insert({
      version: data.version,
      platform: data.platform,
      variant: data.variant,
      file_url: data.file_url,
      file_name: data.file_name,
      file_size: data.file_size,
      release_notes: data.release_notes,
      is_active: data.is_active,
      is_mandatory: data.is_mandatory,
    })
    .select()
    .single();

  if (error) {
    console.error('[SupabaseAdapter] 创建发布版本失败:', error);
    throw new Error(`创建发布版本失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 发布版本创建成功:', result.id);
  return result;
}
```

**Step 3: 实现updateRelease和deleteRelease方法**

```typescript
async updateRelease(id: string, data: Partial<CreateReleaseData>): Promise<AppRelease> {
  console.log('[SupabaseAdapter] 更新发布版本:', id);

  const { data: result, error } = await this.supabase
    .from('releases')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[SupabaseAdapter] 更新发布版本失败:', error);
    throw new Error(`更新发布版本失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 发布版本更新成功');
  return result;
}

async deleteRelease(id: string): Promise<void> {
  console.log('[SupabaseAdapter] 删除发布版本:', id);

  const { error } = await this.supabase
    .from('releases')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[SupabaseAdapter] 删除发布版本失败:', error);
    throw new Error(`删除发布版本失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 发布版本删除成功');
}
```

**Step 4: 实现toggleReleaseStatus和getReleaseById方法**

```typescript
async toggleReleaseStatus(id: string, isActive: boolean): Promise<AppRelease> {
  console.log('[SupabaseAdapter] 切换发布版本状态:', id, isActive);

  return this.updateRelease(id, { is_active: isActive });
}

async getReleaseById(id: string): Promise<AppRelease | null> {
  const { data, error } = await this.supabase
    .from('releases')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`获取发布版本失败: ${error.message}`);
  }

  return data;
}
```

**Step 5: 提交更改**

```bash
git add lib/admin/supabase-adapter.ts
git commit -m "$(cat <<'EOF'
feat(admin): 实现Supabase适配器的发布版本功能

实现发布版本的CRUD操作和状态切换功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 实现Supabase适配器 - 文件管理功能

**Files:**
- Modify: `lib/admin/supabase-adapter.ts`

**Step 1: 实现listStorageFiles方法**

```typescript
async listStorageFiles(): Promise<StorageFile[]> {
  console.log('[SupabaseAdapter] 获取存储文件列表');

  const { data, error } = await this.supabase
    .storage
    .from('admin-files')
    .list();

  if (error) {
    console.error('[SupabaseAdapter] 获取文件列表失败:', error);
    throw new Error(`获取文件列表失败: ${error.message}`);
  }

  const files: StorageFile[] = (data || []).map(file => ({
    name: file.name,
    url: this.supabase.storage.from('admin-files').getPublicUrl(file.name).data.publicUrl,
    size: file.metadata?.size,
    lastModified: file.metadata?.lastModified || file.created_at,
    source: 'supabase' as const,
  }));

  console.log('[SupabaseAdapter] 获取到', files.length, '个文件');
  return files;
}
```

**Step 2: 实现deleteStorageFile方法**

```typescript
async deleteStorageFile(fileName: string): Promise<void> {
  console.log('[SupabaseAdapter] 删除存储文件:', fileName);

  const { error } = await this.supabase
    .storage
    .from('admin-files')
    .remove([fileName]);

  if (error) {
    console.error('[SupabaseAdapter] 删除文件失败:', error);
    throw new Error(`删除文件失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 文件删除成功');
}
```

**Step 3: 实现renameStorageFile方法**

```typescript
async renameStorageFile(oldName: string, newName: string): Promise<void> {
  console.log('[SupabaseAdapter] 重命名文件:', oldName, '->', newName);

  const { error } = await this.supabase
    .storage
    .from('admin-files')
    .move(oldName, newName);

  if (error) {
    console.error('[SupabaseAdapter] 重命名文件失败:', error);
    throw new Error(`重命名文件失败: ${error.message}`);
  }

  console.log('[SupabaseAdapter] 文件重命名成功');
}
```

**Step 4: 实现downloadStorageFile方法**

```typescript
async downloadStorageFile(fileName: string): Promise<{ data: string; contentType: string; fileName: string }> {
  console.log('[SupabaseAdapter] 下载文件:', fileName);

  const { data, error } = await this.supabase
    .storage
    .from('admin-files')
    .download(fileName);

  if (error) {
    console.error('[SupabaseAdapter] 下载文件失败:', error);
    throw new Error(`下载文件失败: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  console.log('[SupabaseAdapter] 文件下载成功');
  return {
    data: base64,
    contentType: data.type,
    fileName: fileName,
  };
}
```

**Step 5: 提交更改**

```bash
git add lib/admin/supabase-adapter.ts
git commit -m "$(cat <<'EOF'
feat(admin): 实现Supabase适配器的文件管理功能

实现文件列表、删除、重命名和下载功能

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7-10: 实现CloudBase适配器

**Files:**
- Modify: `lib/admin/cloudbase-adapter.ts`

**实施内容:**
参考Supabase适配器的实现模式,在CloudBase适配器中实现相同的方法:
- 社交链接: listSocialLinks, getSocialLinkById, createSocialLink, updateSocialLink, deleteSocialLink, updateSocialLinksOrder
- 广告管理: listAds, getAdById, createAd, updateAd, deleteAd, toggleAdStatus, getAdStats
- 发布版本: listReleases, getReleaseById, createRelease, updateRelease, deleteRelease, toggleReleaseStatus
- 文件管理: listStorageFiles, deleteStorageFile, renameStorageFile, downloadStorageFile

**注意事项:**
- CloudBase使用NoSQL,集合名称: social_links, advertisements, releases
- CloudBase Storage使用uploadFile和getTempFileURL方法
- 添加详细的调试日志
- 每完成一组功能提交一次

---

## Task 11-15: 创建Server Actions

**Files:**
- Create: `actions/admin-social-links.ts`
- Create: `actions/admin-ads.ts`
- Create: `actions/admin-releases.ts`
- Modify: `actions/admin-files.ts` (如果不存在则创建)

**实施内容:**
为每个功能模块创建Server Actions,调用数据库适配器方法:
- 所有actions返回统一格式: `{success: boolean, data?: any, error?: string}`
- 添加错误处理和日志
- 文件上传actions需要处理FormData
- 参考模板项目的actions实现

**提交策略:**
每完成一个actions文件提交一次

---

## Task 16-20: 复制前端页面

**Files:**
- Create: `app/admin/social-links/page.tsx`
- Create: `app/admin/ads/page.tsx`
- Create: `app/admin/files/page.tsx`
- Create: `app/admin/releases/page.tsx`
- Create: `app/admin/settings/page.tsx`

**实施内容:**
直接从模板项目复制页面代码:
- 复制路径: `D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\[page-name]\page.tsx`
- 确保import路径正确
- 确保所有UI组件已安装(shadcn/ui)
- 测试页面是否正常显示

**提交策略:**
每复制一个页面提交一次

---

## Task 21-22: 创建数据库初始化脚本

**Files:**
- Create: `scripts/create-admin-tables-supabase.sql`
- Create: `scripts/create-admin-tables-cloudbase.js`

**实施内容:**

**Supabase SQL脚本:**
```sql
-- 社交链接表
CREATE TABLE social_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  icon TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 广告表
CREATE TABLE advertisements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  position TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_url_cn TEXT,
  file_url_intl TEXT,
  link_url TEXT,
  priority INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  file_size INTEGER,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 发布版本表
CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  variant TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  release_notes TEXT,
  is_active BOOLEAN DEFAULT true,
  is_mandatory BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**CloudBase脚本:**
创建对应的集合和索引

**提交:**
一次性提交两个脚本

---

## 测试计划

完成所有任务后,按以下顺序测试:

1. **切换到国际版(en)测试Supabase:**
   - 修改环境变量: `NEXT_PUBLIC_DEFAULT_LANGUAGE=en`
   - 运行Supabase脚本创建表
   - 测试所有功能的CRUD操作
   - 测试文件上传

2. **切换到国内版(zh)测试CloudBase:**
   - 修改环境变量: `NEXT_PUBLIC_DEFAULT_LANGUAGE=zh`
   - 运行CloudBase脚本创建集合
   - 测试所有功能的CRUD操作
   - 测试文件上传

3. **检查日志:**
   - 确认所有操作都有日志输出
   - 确认错误处理正常工作

---

## 实施顺序总结

1. ✅ Task 1-2: 类型定义和接口扩展
2. ✅ Task 3-6: Supabase适配器实现
3. ⏳ Task 7-10: CloudBase适配器实现
4. ⏳ Task 11-15: Server Actions创建
5. ⏳ Task 16-20: 前端页面复制
6. ⏳ Task 21-22: 数据库脚本创建
7. ⏳ 测试和验证

---

**计划完成。准备开始实施。**
