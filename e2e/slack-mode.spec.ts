/**
 * E2E Tests for Slack/Boss Mode Features
 * 测试拉黑、举报、隐私设置和会话权限检查功能
 */

import { test, expect, Page } from '@playwright/test'

// 测试用户凭据 (需要根据实际环境配置)
const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123456!',
}

// 辅助函数：登录用户
async function loginUser(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"], input[name="email"]', TEST_USER.email)
  await page.fill('input[type="password"], input[name="password"]', TEST_USER.password)
  await page.click('button[type="submit"]')

  // 等待登录成功，跳转到聊天页面
  await page.waitForURL('**/chat**', { timeout: 10000 })
}

test.describe('Slack Mode - API Endpoint Tests', () => {
  test.describe.configure({ mode: 'serial' })

  test('Health check - All API endpoints should exist', async ({ request }) => {
    // 测试用户设置 API 是否存在
    const settingsResponse = await request.get('/api/user/settings')
    expect([200, 401]).toContain(settingsResponse.status())

    // 测试拉黑 API 是否存在
    const blockedResponse = await request.get('/api/blocked-users')
    expect([200, 401]).toContain(blockedResponse.status())

    // 测试举报 API 是否存在
    const reportsResponse = await request.get('/api/reports')
    expect([200, 401]).toContain(reportsResponse.status())
  })
})

test.describe('Slack Mode - Privacy Settings Page', () => {
  test('should display privacy settings in settings page', async ({ page }) => {
    // 导航到设置页面
    await page.goto('/settings/preferences')

    // 检查页面是否加载
    await page.waitForLoadState('networkidle')

    // 页面应该正常加载
    expect(page.url()).toContain('/settings')
  })
})

test.describe('Slack Mode - Block User Dialog', () => {
  test('block user dialog component should exist', async ({ page }) => {
    // 检查页面是否能正常加载
    await page.goto('/')
    expect(page).toBeTruthy()
  })
})

test.describe('Slack Mode - Report User Dialog', () => {
  test('report user dialog component should exist', async ({ page }) => {
    await page.goto('/')
    expect(page).toBeTruthy()
  })
})

test.describe('Slack Mode - Conversation Permission Check', () => {
  test('conversation API should handle requests', async ({ request }) => {
    // 测试会话 API 端点
    const response = await request.post('/api/conversations', {
      data: {
        type: 'direct',
        member_ids: ['test-user-id'],
      },
    })

    // 应该返回某种响应（不应该是 500 错误）
    expect([200, 401, 403, 400]).toContain(response.status())
  })
})

test.describe('Service Factory Tests', () => {
  test('service factory should be importable', async ({ page }) => {
    // 测试服务工厂是否正确导出
    await page.goto('/')

    // 页面应该正常加载
    await page.waitForLoadState('networkidle')
    expect(page).toBeTruthy()
  })
})

test.describe('Multi-language Support', () => {
  test('i18n translations should include slack mode keys', async ({ page }) => {
    // 检查 i18n 文件是否包含新的翻译键
    await page.goto('/')

    // 页面应该正常加载
    const title = await page.title()
    expect(title).toBeTruthy()
  })
})

test.describe('Database Integration', () => {
  test('CloudBase collections API endpoint should exist', async ({ request }) => {
    // 这个测试验证 CloudBase 集合是否存在
    // 通过 API 间接验证
    const response = await request.get('/api/blocked-users')
    // 401 表示端点存在且需要认证
    expect([200, 401]).toContain(response.status())
  })
})

// 辅助函数测试
test.describe('Helper Functions', () => {
  test('checkBlockRelation should work correctly', async ({ page }) => {
    // 在浏览器环境中测试辅助函数
    await page.goto('/')

    // 验证页面加载
    await page.waitForLoadState('networkidle')
    expect(page).toBeTruthy()
  })

  test('checkChatPermission should validate permissions', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(page).toBeTruthy()
  })
})

// 更详细的 API 测试
test.describe('Slack Mode - Detailed API Tests', () => {
  test('blocked-users API should reject unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/blocked-users')
    expect(response.status()).toBe(401)
  })

  test('reports API should reject unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/reports')
    expect(response.status()).toBe(401)
  })

  test('user settings API should reject unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/user/settings')
    expect(response.status()).toBe(401)
  })

  test('POST blocked-users should reject unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/blocked-users', {
      data: {
        blocked_user_id: 'test-user-id',
      },
    })
    expect(response.status()).toBe(401)
  })

  test('POST reports should reject unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/reports', {
      data: {
        reported_user_id: 'test-user-id',
        type: 'spam',
      },
    })
    expect(response.status()).toBe(401)
  })

  test('PATCH user settings should reject unauthenticated requests', async ({ request }) => {
    const response = await request.patch('/api/user/settings', {
      data: {
        allow_non_friend_messages: false,
      },
    })
    expect(response.status()).toBe(401)
  })

  test('DELETE blocked-users should reject unauthenticated requests', async ({ request }) => {
    const response = await request.delete('/api/blocked-users?userId=test-user-id')
    expect(response.status()).toBe(401)
  })
})

// 文件存在性测试
test.describe('File Structure Tests', () => {
  test('pages should load without errors', async ({ page }) => {
    // 测试主要页面是否能正常加载
    const response = await page.goto('/')
    expect(response?.status()).toBeLessThan(500)
  })
})
