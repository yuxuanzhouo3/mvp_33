-- 群公告表
CREATE TABLE IF NOT EXISTS group_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_group_announcements_conversation ON group_announcements(conversation_id);
CREATE INDEX IF NOT EXISTS idx_group_announcements_created_at ON group_announcements(created_at DESC);

-- RLS 策略
ALTER TABLE group_announcements ENABLE ROW LEVEL SECURITY;

-- 群成员可以查看公告
CREATE POLICY "群成员可以查看公告" ON group_announcements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_members
            WHERE conversation_members.conversation_id = group_announcements.conversation_id
            AND conversation_members.user_id = auth.uid()
        )
    );

-- 群管理员可以创建公告
CREATE POLICY "群管理员可以创建公告" ON group_announcements
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversation_members
            WHERE conversation_members.conversation_id = group_announcements.conversation_id
            AND conversation_members.user_id = auth.uid()
            AND conversation_members.role IN ('owner', 'admin')
        )
    );

-- 群管理员可以更新公告
CREATE POLICY "群管理员可以更新公告" ON group_announcements
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM conversation_members
            WHERE conversation_members.conversation_id = group_announcements.conversation_id
            AND conversation_members.user_id = auth.uid()
            AND conversation_members.role IN ('owner', 'admin')
        )
    );

-- 群管理员可以删除公告
CREATE POLICY "群管理员可以删除公告" ON group_announcements
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM conversation_members
            WHERE conversation_members.conversation_id = group_announcements.conversation_id
            AND conversation_members.user_id = auth.uid()
            AND conversation_members.role IN ('owner', 'admin')
        )
    );
