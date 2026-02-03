-- Hidden Messages Table
-- Stores which messages are hidden for each user (per-user visibility)

CREATE TABLE IF NOT EXISTS hidden_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    hidden_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, message_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_hidden_messages_user_id ON hidden_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_messages_message_id ON hidden_messages(message_id);

-- RLS policies
ALTER TABLE hidden_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see their own hidden messages
CREATE POLICY "Users can view own hidden messages"
    ON hidden_messages FOR SELECT
    USING (auth.uid() = user_id);

-- Users can hide messages for themselves
CREATE POLICY "Users can hide messages"
    ON hidden_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can unhide messages for themselves
CREATE POLICY "Users can unhide messages"
    ON hidden_messages FOR DELETE
    USING (auth.uid() = user_id);































































































