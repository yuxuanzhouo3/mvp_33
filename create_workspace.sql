-- 创建一个测试 workspace
INSERT INTO workspaces (name, description, created_by)
VALUES ('测试工作区', '用于测试群聊功能的工作区', (SELECT id FROM users LIMIT 1))
RETURNING id, name;
