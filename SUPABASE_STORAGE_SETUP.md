# Supabase 存储桶设置说明

## 问题描述

群文件上传失败,错误信息: `Bucket not found (statusCode: 404)`

## 解决方案

需要在 Supabase 中创建 `group-files` 存储桶。请按照以下步骤操作:

### 1. 在 Supabase SQL Editor 中执行以下脚本

打开 Supabase Dashboard → SQL Editor → 新建查询,然后执行:

```sql
-- 运行脚本: scripts/018_setup_group_files_storage.sql
```

或者直接复制以下 SQL:

```sql
-- Setup Supabase Storage for group files
-- Run this in Supabase SQL Editor

-- Create storage bucket for group files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-files',
  'group-files',
  true,
  104857600, -- 100MB in bytes
  NULL -- Allow all file types
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy: Allow authenticated users to upload files to groups they are members of
CREATE POLICY "Users can upload files to their groups"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'group-files' AND
  (storage.foldername(name))[1] IN (
    SELECT conversation_id::text
    FROM conversation_members
    WHERE user_id = auth.uid()
  )
);

-- Create storage policy: Allow authenticated users to update files in their groups
CREATE POLICY "Users can update files in their groups"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'group-files' AND
  (storage.foldername(name))[1] IN (
    SELECT conversation_id::text
    FROM conversation_members
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'group-files' AND
  (storage.foldername(name))[1] IN (
    SELECT conversation_id::text
    FROM conversation_members
    WHERE user_id = auth.uid()
  )
);

-- Create storage policy: Allow authenticated users to delete files in their groups
CREATE POLICY "Users can delete files in their groups"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'group-files' AND
  (storage.foldername(name))[1] IN (
    SELECT conversation_id::text
    FROM conversation_members
    WHERE user_id = auth.uid()
  )
);

-- Create storage policy: Allow public read access to group files
CREATE POLICY "Public can view group files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'group-files');
```

### 2. 验证存储桶已创建

在 Supabase Dashboard → Storage 中,应该能看到 `group-files` 存储桶。

### 3. 测试文件上传

重新尝试在群聊中上传文件,应该可以成功上传。

## 相关文件

- 存储桶配置脚本: [scripts/018_setup_group_files_storage.sql](scripts/018_setup_group_files_storage.sql)
- 群文件上传 API: [app/api/groups/[id]/files/route.ts](app/api/groups/[id]/files/route.ts)
- 群头像上传 API: [app/api/groups/[id]/upload-avatar/route.ts](app/api/groups/[id]/upload-avatar/route.ts)
