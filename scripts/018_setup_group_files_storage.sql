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

-- Note: The folder structure will be: group-files/{groupId}/{filename}
-- Example: group-files/123e4567-e89b-12d3-a456-426614174000/document.pdf
