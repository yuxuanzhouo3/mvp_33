-- Workspace announcements (global announcements per workspace)
CREATE TABLE IF NOT EXISTS workspace_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_announcements_workspace_created_at
  ON workspace_announcements(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_announcements_workspace_pinned_created_at
  ON workspace_announcements(workspace_id, is_pinned DESC, created_at DESC);

ALTER TABLE workspace_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_announcements_select_for_members ON workspace_announcements;
CREATE POLICY workspace_announcements_select_for_members
ON workspace_announcements FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_announcements.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS workspace_announcements_insert_for_admins ON workspace_announcements;
CREATE POLICY workspace_announcements_insert_for_admins
ON workspace_announcements FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_announcements.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS workspace_announcements_update_for_admins ON workspace_announcements;
CREATE POLICY workspace_announcements_update_for_admins
ON workspace_announcements FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_announcements.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_announcements.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS workspace_announcements_delete_for_admins ON workspace_announcements;
CREATE POLICY workspace_announcements_delete_for_admins
ON workspace_announcements FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = workspace_announcements.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
  )
);

DROP TRIGGER IF EXISTS update_workspace_announcements_updated_at ON workspace_announcements;
CREATE TRIGGER update_workspace_announcements_updated_at
  BEFORE UPDATE ON workspace_announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
