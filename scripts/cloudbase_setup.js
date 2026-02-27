/**
 * 腾讯云 CloudBase 数据库初始化脚本
 * 基于 Supabase 数据库结构，包含所有后续新增的字段
 * 
 * 使用方法：
 * 1. 确保已安装 @cloudbase/node-sdk: npm install @cloudbase/node-sdk
 * 2. 配置环境变量：CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID, CLOUDBASE_SECRET_KEY
 * 3. 运行: node scripts/cloudbase_setup.js
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '..', '.env.cn'));

const cloudbase = require('@cloudbase/node-sdk');

// 初始化云开发客户端
let app;
let db;

try {
  app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY
  });
  db = app.database();
} catch (initError) {
  console.error('CloudBase 初始化失败:', initError.message);
  process.exit(1);
}

/**
 * 创建集合（通过插入测试数据自动创建）
 */
async function createCollection(collectionName, sampleData) {
  try {
    console.log(`正在创建集合: ${collectionName}...`);
    
    // 尝试插入一条测试数据，如果集合不存在会自动创建
    const result = await db.collection(collectionName).add(sampleData);
    
    // CloudBase返回的ID可能在result.id或result._id中
    const docId = result.id || result._id || result.inserted || result.insertedId;
    
    if (docId) {
      // 立即删除测试数据
      try {
        await db.collection(collectionName).doc(docId).remove();
        console.log(`✓ 集合 ${collectionName} 创建成功`);
      } catch (removeError) {
        console.log(`✓ 集合 ${collectionName} 已存在（测试数据删除失败，但不影响使用）`);
      }
    } else {
      console.log(`✓ 集合 ${collectionName} 已存在`);
    }
    
    return true;
  } catch (error) {
    // 检查是否是数据库或集合不存在的错误
    if (error.message && (
      error.message.includes('not exist') || 
      error.message.includes('COLLECTION_NOT_EXIST') ||
      error.message.includes('Db or Table not exist') ||
      error.code === 'DATABASE_COLLECTION_NOT_EXIST' ||
      error.code === 'ResourceNotFound'
    )) {
      console.log(`✗ 集合 ${collectionName} 创建失败: ${error.message}`);
      console.log(`  提示: 如果这是首次运行，请先在 CloudBase 控制台创建数据库实例`);
      console.log(`  访问: https://console.cloud.tencent.com/tcb`);
      return false;
    }
    
    // 如果集合已存在，尝试删除可能的测试数据
    if (error.message.includes('already exists') || error.code === 'COLLECTION_EXISTS') {
      console.log(`✓ 集合 ${collectionName} 已存在`);
      return true;
    }

    console.log(`✗ 集合 ${collectionName} 创建时出错: ${error.message}`);
    return false;
  }
}

/**
 * 生成 UUID（简化版，用于测试数据）
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 初始化数据库
 */
async function initDatabase() {
  console.log('开始初始化 CloudBase 数据库...\n');
  
  // 检查环境变量
  if (!process.env.CLOUDBASE_ENV_ID || !process.env.CLOUDBASE_SECRET_ID) {
    console.error('错误: 缺少必要的环境变量');
    console.error('请设置: CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID, CLOUDBASE_SECRET_KEY');
    process.exit(1);
  }

  // 显示配置信息（隐藏敏感信息）
  console.log(`环境 ID: ${process.env.CLOUDBASE_ENV_ID}`);
  console.log(`Secret ID: ${process.env.CLOUDBASE_SECRET_ID.substring(0, 8)}...`);
  console.log('');

  // 测试数据库连接 - 先尝试查询已存在的集合
  console.log('正在测试数据库连接...');
  let dbInitialized = false;
  
  // 尝试查询用户可能已创建的集合
  const testCollections = ['_init', 'users', 'test'];
  for (const testCollection of testCollections) {
    try {
      const testResult = await db.collection(testCollection).limit(1).get();
      console.log(`✓ 找到已存在的集合: ${testCollection}`);
      dbInitialized = true;
      break;
    } catch (testError) {
      // 继续尝试下一个
    }
  }
  
  if (!dbInitialized) {
    console.log('⚠️  未找到已存在的集合');
    console.log('   提示: 如果已在控制台创建集合但仍无法访问，请检查：');
    console.log('   1. 数据库类型是否为"云数据库"（不是其他类型）');
    console.log('   2. Secret ID/Key 是否有数据库读写权限');
    console.log('   3. 数据库实例是否已完全启用（可能需要等待几分钟）');
    console.log('   4. 在控制台确认集合是否真的创建成功\n');
  } else {
    console.log('✓ 数据库已初始化，可以创建新集合\n');
  }

  const now = new Date();

  // 1. users 集合
  // 包含字段: id, email, username, full_name, avatar_url, phone, department, title, 
  //           status, status_message, created_at, updated_at
  const usersSample = {
    _id: generateUUID(),
    email: 'setup-test@example.com',
    username: 'testuser',
    full_name: '测试用户',
    avatar_url: null,
    phone: null,
    department: null,
    title: null,
    status: 'offline', // 'online', 'offline', 'away', 'busy'
    status_message: null,
    created_at: now,
    updated_at: now
  };
  await createCollection('users', usersSample);

  // 2. workspaces 集合
  // 包含字段: id, name, logo_url, domain, owner_id, settings, created_at, updated_at
  const workspacesSample = {
    _id: generateUUID(),
    name: '测试工作空间',
    logo_url: null,
    domain: 'test-workspace',
    owner_id: generateUUID(),
    settings: {
      allow_guest_users: false,
      max_file_size_mb: 100,
      locale: 'en'
    },
    created_at: now,
    updated_at: now
  };
  await createCollection('workspaces', workspacesSample);

  // 3. workspace_members 集合
  // 包含字段: id, workspace_id, user_id, role, joined_at
  const workspaceMembersSample = {
    _id: generateUUID(),
    workspace_id: generateUUID(),
    user_id: generateUUID(),
    role: 'member', // 'owner', 'admin', 'member', 'guest'
    joined_at: now
  };
  await createCollection('workspace_members', workspaceMembersSample);

  // 4. conversations 集合
  // 包含字段: id, workspace_id, type, name, description, avatar_url, created_by, 
  //           is_private, created_at, updated_at, last_message_at, deleted_at (新增)
  const conversationsSample = {
    _id: generateUUID(),
    workspace_id: generateUUID(),
    type: 'direct', // 'direct', 'group', 'channel'
    name: null,
    description: null,
    avatar_url: null,
    created_by: generateUUID(),
    is_private: true,
    created_at: now,
    updated_at: now,
    last_message_at: null,
    deleted_at: null // 新增字段：软删除时间戳
  };
  await createCollection('conversations', conversationsSample);

  // 5. conversation_members 集合
  // 包含字段: id, conversation_id, user_id, role, joined_at, last_read_at, 
  //           notification_setting, is_hidden (新增), hidden_at (新增), 
  //           is_pinned (新增), pinned_at (新增), deleted_at (新增)
  const conversationMembersSample = {
    _id: generateUUID(),
    conversation_id: generateUUID(),
    user_id: generateUUID(),
    role: 'member', // 'owner', 'admin', 'member'
    joined_at: now,
    last_read_at: null,
    notification_setting: 'all', // 'all', 'mentions', 'none'
    is_hidden: false, // 新增字段：是否隐藏
    hidden_at: null, // 新增字段：隐藏时间
    is_pinned: false, // 新增字段：是否置顶
    pinned_at: null, // 新增字段：置顶时间
    deleted_at: null // 新增字段：用户删除时间
  };
  await createCollection('conversation_members', conversationMembersSample);

  // 6. messages 集合
  // 包含字段: id, conversation_id, sender_id, content, type, metadata, reply_to, 
  //           reactions, is_edited, is_deleted, created_at, updated_at, is_recalled (新增)
  // type 包含: 'text', 'image', 'file', 'video', 'audio', 'system', 'code' (新增)
  const messagesSample = {
    _id: generateUUID(),
    conversation_id: generateUUID(),
    sender_id: generateUUID(),
    content: '测试消息',
    type: 'text', // 'text', 'image', 'file', 'video', 'audio', 'system', 'code'
    metadata: null,
    reply_to: null,
    reactions: [],
    is_edited: false,
    is_deleted: false,
    is_recalled: false, // 新增字段：是否撤回
    created_at: now,
    updated_at: now
  };
  await createCollection('messages', messagesSample);

  // 7. contacts 集合
  // 包含字段: id, user_id, contact_user_id, nickname, tags, is_favorite, 
  //           is_blocked, added_at
  const contactsSample = {
    _id: generateUUID(),
    user_id: generateUUID(),
    contact_user_id: generateUUID(),
    nickname: null,
    tags: [],
    is_favorite: false,
    is_blocked: false,
    added_at: now
  };
  await createCollection('contacts', contactsSample);

  // 8. contact_requests 集合 (新增表)
  // 包含字段: id, requester_id, recipient_id, message, status, created_at, updated_at
  const contactRequestsSample = {
    _id: generateUUID(),
    requester_id: generateUUID(),
    recipient_id: generateUUID(),
    message: null,
    status: 'pending', // 'pending', 'accepted', 'rejected', 'cancelled'
    created_at: now,
    updated_at: now
  };
  await createCollection('contact_requests', contactRequestsSample);

  // 9. departments 集合
  // 包含字段: id, workspace_id, name, parent_id, manager_id, description, created_at
  const departmentsSample = {
    _id: generateUUID(),
    workspace_id: generateUUID(),
    name: '测试部门',
    parent_id: null,
    manager_id: null,
    description: null,
    created_at: now
  };
  await createCollection('departments', departmentsSample);

  // 10. user_profiles 集合
  // 包含字段: user_id, bio, location, timezone, language, preferences
  const userProfilesSample = {
    _id: generateUUID(),
    user_id: generateUUID(),
    bio: null,
    location: null,
    timezone: null,
    language: 'en',
    preferences: {
      theme: 'auto',
      notification_sound: true,
      message_preview: true,
      compact_mode: false
    }
  };
  await createCollection('user_profiles', userProfilesSample);

  // 11. hidden_messages 集合 (新增表)
  // 包含字段: id, user_id, message_id, hidden_at
  const hiddenMessagesSample = {
    _id: generateUUID(),
    user_id: generateUUID(),
    message_id: generateUUID(),
    hidden_at: now
  };
  await createCollection('hidden_messages', hiddenMessagesSample);

  // 12. workspace_announcements 集合
  const workspaceAnnouncementsSample = {
    _id: generateUUID(),
    workspace_id: generateUUID(),
    title: '测试公告',
    content: '这是测试公告内容',
    is_pinned: false,
    created_by: generateUUID(),
    created_at: now,
    updated_at: now,
    region: 'cn'
  };
  await createCollection('workspace_announcements', workspaceAnnouncementsSample);

  // 13. workspace_join_requests 集合
  const workspaceJoinRequestsSample = {
    _id: generateUUID(),
    workspace_id: generateUUID(),
    user_id: generateUUID(),
    request_message: '请加入工作空间',
    status: 'pending', // 'pending' | 'approved' | 'rejected'
    reviewed_by: null,
    reviewed_at: null,
    created_at: now,
    updated_at: now,
    region: 'cn'
  };
  await createCollection('workspace_join_requests', workspaceJoinRequestsSample);

  // 14. group_files 集合
  const groupFilesSample = {
    _id: generateUUID(),
    conversation_id: generateUUID(),
    file_name: 'test.txt',
    file_size: 128,
    file_type: 'text/plain',
    file_url: 'https://example.com/test.txt',
    uploaded_by: generateUUID(),
    created_at: now,
    region: 'cn'
  };
  await createCollection('group_files', groupFilesSample);

  // 检查是否有失败的集合
  const failedCollections = [];
  // 这里可以添加逻辑来跟踪失败的集合
  
  console.log('\n数据库初始化完成！');
  
  // 如果有失败的集合，提供说明
  if (failedCollections.length > 0) {
    console.log('\n⚠️  部分集合创建失败，可能的原因：');
    console.log('1. CloudBase 数据库实例尚未创建');
    console.log('2. 环境 ID 或密钥配置错误');
    console.log('3. 权限不足');
    console.log('\n请执行以下步骤：');
    console.log('1. 登录 CloudBase 控制台: https://console.cloud.tencent.com/tcb');
    console.log('2. 选择环境 ID: ' + process.env.CLOUDBASE_ENV_ID);
    console.log('3. 进入"数据库"页面，创建数据库实例（如果还没有）');
    console.log('4. 确认数据库已启用后，重新运行此脚本');
  }
  
  console.log('\n注意：');
  console.log('1. CloudBase 的索引需要在控制台手动创建');
  console.log('2. 建议创建以下索引：');
  console.log('   - users: email (唯一), username (唯一)');
  console.log('   - workspaces: domain (唯一), owner_id');
  console.log('   - workspace_members: workspace_id, user_id (复合唯一)');
  console.log('   - conversations: workspace_id, last_message_at, deleted_at');
  console.log('   - conversation_members: conversation_id, user_id (复合唯一), user_id+is_hidden, user_id+pinned_at');
  console.log('   - messages: conversation_id+created_at, sender_id, is_recalled');
  console.log('   - contacts: user_id, contact_user_id (复合唯一)');
  console.log('   - contact_requests: requester_id, recipient_id (复合唯一)');
  console.log('   - hidden_messages: user_id, message_id (复合唯一)');
  console.log('   - workspace_announcements: workspace_id+created_at');
  console.log('   - workspace_join_requests: workspace_id+status, user_id+workspace_id');
  console.log('   - group_files: conversation_id+created_at, uploaded_by');
}

// 运行初始化
initDatabase()
  .then(() => {
    console.log('\n初始化脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n初始化失败:', error);
    process.exit(1);
  });
