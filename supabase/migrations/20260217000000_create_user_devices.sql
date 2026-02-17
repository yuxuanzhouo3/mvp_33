-- Create user_devices table
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  browser VARCHAR(100),
  os VARCHAR(100),
  ip_address VARCHAR(45),
  location VARCHAR(255),
  session_token TEXT NOT NULL UNIQUE,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, session_token)
);

-- Create indexes
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_session_token ON user_devices(session_token);

-- Enable RLS
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own devices"
ON user_devices FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
ON user_devices FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow service role to insert devices (for login API)
CREATE POLICY "Service role can insert devices"
ON user_devices FOR INSERT
TO service_role
WITH CHECK (true);
