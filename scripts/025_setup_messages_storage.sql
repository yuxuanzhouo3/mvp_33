-- Setup Supabase Storage for message files (images, videos, documents)
-- Run this in Supabase SQL Editor

-- Create storage bucket for messages
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'messages',
  'messages',
  true,
  10485760, -- 10MB in bytes
  NULL -- Allow all file types
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy: Allow authenticated users to upload files to conversations they are members of
CREATE POLICY "Users can upload files to their conversations"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'messages' AND
  EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id::text = (storage.foldername(name))[1]
    AND user_id = auth.uid()
  )
);

-- Create storage policy: Allow authenticated users to view files in conversations they are members of
CREATE POLICY "Users can view files in their conversations"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'messages' AND
  (
    -- User is a member of the conversation
    EXISTS (
      SELECT 1 FROM conversation_members
      WHERE conversation_id::text = (storage.foldername(name))[1]
      AND user_id = auth.uid()
    )
    OR
    -- Public read access (for images and files that should be viewable)
    true
  )
);

-- Create storage policy: Allow authenticated users to delete files they uploaded
-- Note: This is optional, you may want to restrict deletion to conversation owners/admins
CREATE POLICY "Users can delete files from their conversations"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'messages' AND
  EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id::text = (storage.foldername(name))[1]
    AND user_id = auth.uid()
  )
);

-- Note: The folder structure will be: messages/{conversationId}/{filename}
-- Example: messages/123e4567-e89b-12d3-a456-426614174000/1234567890.jpg

-- Grant necessary permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;












