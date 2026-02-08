-- Seed demo data for enterprise chat application

-- Insert demo users
INSERT INTO users (id, email, username, full_name, avatar_url, department, title, status) VALUES
('00000000-0000-0000-0000-000000000001', 'alice@company.com', 'alice', 'Alice Zhang', '/placeholder.svg?height=40&width=40', 'Engineering', 'Senior Software Engineer', 'online'),
('00000000-0000-0000-0000-000000000002', 'bob@company.com', 'bob', 'Bob Smith', '/placeholder.svg?height=40&width=40', 'Product', 'Product Manager', 'online'),
('00000000-0000-0000-0000-000000000003', 'carol@company.com', 'carol', 'Carol Wang', '/placeholder.svg?height=40&width=40', 'Design', 'UI/UX Designer', 'away'),
('00000000-0000-0000-0000-000000000004', 'david@company.com', 'david', 'David Lee', '/placeholder.svg?height=40&width=40', 'Engineering', 'Engineering Manager', 'online'),
('00000000-0000-0000-0000-000000000005', 'emma@company.com', 'emma', 'Emma Brown', '/placeholder.svg?height=40&width=40', 'Marketing', 'Marketing Director', 'busy')
ON CONFLICT (id) DO NOTHING;

-- Insert demo workspace
INSERT INTO workspaces (id, name, logo_url, domain, owner_id) VALUES
('10000000-0000-0000-0000-000000000001', 'TechCorp', '/placeholder.svg?height=50&width=50', 'techcorp', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Add users to workspace
INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'admin'),
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'member'),
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'admin'),
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'member')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Create departments
INSERT INTO departments (id, workspace_id, name, manager_id) VALUES
('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Engineering', '00000000-0000-0000-0000-000000000004'),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Product', '00000000-0000-0000-0000-000000000002'),
('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Design', '00000000-0000-0000-0000-000000000003'),
('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Marketing', '00000000-0000-0000-0000-000000000005')
ON CONFLICT (id) DO NOTHING;

-- Create demo conversations
INSERT INTO conversations (id, workspace_id, type, name, description, created_by, is_private, last_message_at) VALUES
('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'channel', 'general', 'General discussion for the entire team', '00000000-0000-0000-0000-000000000001', false, NOW() - INTERVAL '5 minutes'),
('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'channel', 'engineering', 'Engineering team channel', '00000000-0000-0000-0000-000000000004', true, NOW() - INTERVAL '1 hour'),
('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'direct', NULL, NULL, '00000000-0000-0000-0000-000000000001', true, NOW() - INTERVAL '30 minutes'),
('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'group', 'Product Planning', 'Product roadmap discussions', '00000000-0000-0000-0000-000000000002', false, NOW() - INTERVAL '2 hours')
ON CONFLICT (id) DO NOTHING;

-- Add members to conversations
INSERT INTO conversation_members (conversation_id, user_id, role, last_read_at) VALUES
-- General channel (everyone)
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'admin', NOW() - INTERVAL '5 minutes'),
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member', NOW() - INTERVAL '1 hour'),
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'member', NOW() - INTERVAL '2 hours'),
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'admin', NOW() - INTERVAL '10 minutes'),
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'member', NOW() - INTERVAL '3 hours'),
-- Engineering channel
('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'member', NOW() - INTERVAL '1 hour'),
('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'owner', NOW() - INTERVAL '1 hour'),
-- Direct message (Alice and Bob)
('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'member', NOW() - INTERVAL '30 minutes'),
('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'member', NOW() - INTERVAL '35 minutes'),
-- Product Planning group
('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'owner', NOW() - INTERVAL '2 hours'),
('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'member', NOW() - INTERVAL '3 hours'),
('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'member', NOW() - INTERVAL '3 hours')
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Insert demo messages
INSERT INTO messages (conversation_id, sender_id, content, type, created_at) VALUES
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Welcome everyone to TechCorp! Looking forward to working with you all.', 'text', NOW() - INTERVAL '2 days'),
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Thanks David! Excited to be here!', 'text', NOW() - INTERVAL '2 days' + INTERVAL '5 minutes'),
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Team standup at 10am today - please join!', 'text', NOW() - INTERVAL '1 day'),
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Don''t forget about the product launch next week!', 'text', NOW() - INTERVAL '5 minutes'),
('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'Code review for PR #234 please', 'text', NOW() - INTERVAL '1 hour'),
('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Hey Bob, can we discuss the new feature requirements?', 'text', NOW() - INTERVAL '45 minutes'),
('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'I have some time after lunch', 'text', NOW() - INTERVAL '30 minutes'),
('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Updated the roadmap document - please review', 'text', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- Add contacts
INSERT INTO contacts (user_id, contact_user_id, is_favorite) VALUES
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', true),
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', false),
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', true)
ON CONFLICT (user_id, contact_user_id) DO NOTHING;
