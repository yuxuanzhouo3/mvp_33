-- Contact requests table for friend requests
CREATE TABLE IF NOT EXISTS contact_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, recipient_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contact_requests_requester ON contact_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_contact_requests_recipient ON contact_requests(recipient_id, status);

-- Update timestamp trigger
CREATE TRIGGER update_contact_requests_updated_at BEFORE UPDATE ON contact_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contact_requests
CREATE POLICY "Users can view their own contact requests"
  ON contact_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can create contact requests"
  ON contact_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update their own received requests"
  ON contact_requests FOR UPDATE
  USING (auth.uid() = recipient_id);

