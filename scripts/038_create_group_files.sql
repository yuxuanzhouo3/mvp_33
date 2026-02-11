-- 群文件表
CREATE TABLE IF NOT EXISTS group_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100),
    file_url TEXT NOT NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_group_files_conversation ON group_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_group_files_created_at ON group_files(created_at DESC);

-- RLS 策略
ALTER TABLE group_files ENABLE ROW LEVEL SECURITY;

-- 群成员可以查看文件
CREATE POLICY "群成员可以查看文件" ON group_files
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_members
            WHERE conversation_members.conversation_id = group_files.conversation_id
            AND conversation_members.user_id = auth.uid()
        )
    );

-- 群成员可以上传文件
CREATE POLICY "群成员可以上传文件" ON group_files
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversation_members
            WHERE conversation_members.conversation_id = group_files.conversation_id
            AND conversation_members.user_id = auth.uid()
        )
    );

-- 上传者和管理员可以删除文件
CREATE POLICY "上传者和管理员可以删除文件" ON group_files
    FOR DELETE
    USING (
        uploaded_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM conversation_members
            WHERE conversation_members.conversation_id = group_files.conversation_id
            AND conversation_members.user_id = auth.uid()
            AND conversation_members.role IN ('owner', 'admin')
        )
    );
