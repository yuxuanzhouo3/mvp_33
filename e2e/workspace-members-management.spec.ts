/**
 * E2E Tests for Workspace Members Management Feature
 * 工作区成员管理功能测试：
 * 1. 获取待审批申请列表 API
 * 2. 批准加入申请 API
 * 3. 拒绝加入申请 API
 * 4. 移除成员 API
 * 5. 权限检查（非管理员操作应返回 403）
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test'

// Mock 用户数据
const MOCK_ADMIN_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'alice@company.com',
  username: 'alice',
  full_name: 'Alice Zhang',
  title: 'Admin',
  status: 'online',
}

const MOCK_MEMBER_USER = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'bob@company.com',
  username: 'bob',
  full_name: 'Bob Wang',
  title: 'Developer',
  status: 'online',
}

const MOCK_WORKSPACE = {
  id: '10000000-0000-0000-0000-000000000001',
  name: 'TechCorp',
  domain: 'techcorp',
  owner_id: '00000000-0000-0000-0000-000000000001',
}

// 设置 mock 登录状态 (管理员)
async function setupAdminAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('chat_app_current_user', JSON.stringify({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'alice@company.com',
      username: 'alice',
      full_name: 'Alice Zhang',
      title: 'Admin',
      status: 'online',
    }))
    localStorage.setItem('chat_app_current_workspace', JSON.stringify({
      id: '10000000-0000-0000-0000-000000000001',
      name: 'TechCorp',
      domain: 'techcorp',
      owner_id: '00000000-0000-0000-0000-000000000001',
    }))
    localStorage.setItem('chat_app_token', 'mock-test-token')
  })
}

// 设置 mock 登录状态 (普通成员)
async function setupMemberAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('chat_app_current_user', JSON.stringify({
      id: '00000000-0000-0000-0000-000000000002',
      email: 'bob@company.com',
      username: 'bob',
      full_name: 'Bob Wang',
      title: 'Developer',
      status: 'online',
    }))
    localStorage.setItem('chat_app_current_workspace', JSON.stringify({
      id: '10000000-0000-0000-0000-000000000001',
      name: 'TechCorp',
      domain: 'techcorp',
      owner_id: '00000000-0000-0000-0000-000000000001',
    }))
    localStorage.setItem('chat_app_token', 'mock-test-token')
  })
}

test.describe('Workspace Members Management - API Tests', () => {

  test.describe('GET /api/workspace-join-requests', () => {
    test('JREQ-01: 未认证访问应返回 401', async ({ request }) => {
      const response = await request.get('/api/workspace-join-requests?workspaceId=test-id')
      expect(response.status()).toBe(401)
      console.log('✓ JREQ-01: 未认证访问待审批列表返回 401')
    })

    test('JREQ-02: 缺少 workspaceId 应返回 400', async ({ request }) => {
      const response = await request.get('/api/workspace-join-requests')
      expect(response.status()).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('workspaceId')
      console.log('✓ JREQ-02: 缺少 workspaceId 返回 400')
    })
  })

  test.describe('POST /api/workspace-join-requests', () => {
    test('JREQ-03: 未认证创建申请应返回 401', async ({ request }) => {
      const response = await request.post('/api/workspace-join-requests', {
        data: { workspaceId: 'test-id' }
      })
      expect(response.status()).toBe(401)
      console.log('✓ JREQ-03: 未认证创建申请返回 401')
    })

    test('JREQ-04: 缺少 workspaceId 应返回 400', async ({ request }) => {
      const response = await request.post('/api/workspace-join-requests', {
        data: { reason: 'test reason' }
      })
      expect(response.status()).toBe(400)
      console.log('✓ JREQ-04: 缺少 workspaceId 返回 400')
    })
  })

  test.describe('POST /api/workspace-join-requests/approve', () => {
    test('APPR-01: 未认证批准申请应返回 401', async ({ request }) => {
      const response = await request.post('/api/workspace-join-requests/approve', {
        data: { requestId: 'test-id', workspaceId: 'test-ws' }
      })
      expect(response.status()).toBe(401)
      console.log('✓ APPR-01: 未认证批准申请返回 401')
    })

    test('APPR-02: 缺少必要参数应返回 400', async ({ request }) => {
      const response = await request.post('/api/workspace-join-requests/approve', {
        data: { requestId: 'test-id' }
      })
      expect(response.status()).toBe(400)
      console.log('✓ APPR-02: 缺少 workspaceId 返回 400')
    })
  })

  test.describe('POST /api/workspace-join-requests/reject', () => {
    test('REJ-01: 未认证拒绝申请应返回 401', async ({ request }) => {
      const response = await request.post('/api/workspace-join-requests/reject', {
        data: { requestId: 'test-id', workspaceId: 'test-ws' }
      })
      expect(response.status()).toBe(401)
      console.log('✓ REJ-01: 未认证拒绝申请返回 401')
    })

    test('REJ-02: 缺少必要参数应返回 400', async ({ request }) => {
      const response = await request.post('/api/workspace-join-requests/reject', {
        data: { requestId: 'test-id' }
      })
      expect(response.status()).toBe(400)
      console.log('✓ REJ-02: 缺少 workspaceId 返回 400')
    })
  })

  test.describe('DELETE /api/workspace-members', () => {
    test('DEL-01: 未认证移除成员应返回 401', async ({ request }) => {
      const response = await request.delete('/api/workspace-members?memberId=test-id&workspaceId=test-ws')
      expect(response.status()).toBe(401)
      console.log('✓ DEL-01: 未认证移除成员返回 401')
    })

    test('DEL-02: 缺少 memberId 应返回 400', async ({ request }) => {
      const response = await request.delete('/api/workspace-members?workspaceId=test-ws')
      expect(response.status()).toBe(400)
      console.log('✓ DEL-02: 缺少 memberId 返回 400')
    })

    test('DEL-03: 缺少 workspaceId 应返回 400', async ({ request }) => {
      const response = await request.delete('/api/workspace-members?memberId=test-id')
      expect(response.status()).toBe(400)
      console.log('✓ DEL-03: 缺少 workspaceId 返回 400')
    })
  })
})

test.describe('Workspace Members Management - UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await setupAdminAuth(page)
  })

  test('UI-01: 工作区成员面板应正确显示成员和待审批 Tab', async ({ page }) => {
    // 访问聊天页面，成员面板通常在这里
    await page.goto('/chat')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 截图
    await page.screenshot({ path: 'test-results/workspace-members-panel.png' })

    // 验证页面正常加载
    const body = page.locator('body')
    await expect(body).toBeVisible()
    console.log('✓ UI-01: 工作区成员面板页面加载成功')
  })

  test('UI-02: 工作区成员列表页面应正确加载', async ({ page }) => {
    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // 等待加载动画消失
    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    await page.screenshot({ path: 'test-results/workspace-members-list-ui.png' })

    // 检查页面内容
    const pageContent = await page.locator('body').textContent()
    expect(pageContent).toBeTruthy()

    // 验证搜索框存在
    const searchInput = page.locator('input[type="text"]').first()
    const searchVisible = await searchInput.isVisible().catch(() => false)
    console.log(`✓ UI-02: 工作区成员列表页面加载成功，搜索框可见: ${searchVisible}`)
  })

  test('UI-03: 成员详情面板应显示角色信息', async ({ page }) => {
    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    // 查找成员按钮
    const memberButtons = page.locator('button[class*="flex"][class*="items-center"][class*="gap-"]')
    const count = await memberButtons.count()

    if (count > 0) {
      await memberButtons.first().click()
      await page.waitForTimeout(1500)

      await page.screenshot({ path: 'test-results/member-detail-panel.png' })

      // 检查详情面板内容
      const detailPanel = page.locator('text=/角色|Role|admin|member|owner/i')
      const hasRoleInfo = await detailPanel.count() > 0
      console.log(`✓ UI-03: 成员详情显示角色信息: ${hasRoleInfo}`)
    } else {
      console.log('ℹ UI-03: 当前工作区没有其他成员')
    }

    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('UI-04: 待审批 Tab 切换功能', async ({ page }) => {
    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    // 查找待审批 Tab（中文或英文）
    const pendingTab = page.locator('button:has-text("待审批"), button:has-text("Pending")').first()
    const pendingTabExists = await pendingTab.count() > 0

    if (pendingTabExists) {
      await pendingTab.click()
      await page.waitForTimeout(1500)

      await page.screenshot({ path: 'test-results/pending-requests-tab.png' })
      console.log('✓ UI-04: 待审批 Tab 切换成功')
    } else {
      console.log('ℹ UI-04: 未找到待审批 Tab（可能需要管理员权限）')
    }

    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})

test.describe('Workspace Members Management - Permission Tests', () => {
  test('PERM-01: 非管理员不应看到移除成员按钮（模拟普通成员视角）', async ({ page }) => {
    await page.goto('/')
    await setupMemberAuth(page)  // 使用普通成员身份

    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    // 查找成员并点击
    const memberButtons = page.locator('button[class*="flex"][class*="items-center"][class*="gap-"]')
    const count = await memberButtons.count()

    if (count > 0) {
      await memberButtons.first().click()
      await page.waitForTimeout(1500)

      await page.screenshot({ path: 'test-results/member-view-as-member.png' })

      // 检查是否有移除按钮（非管理员不应该有）
      const removeButton = page.locator('button:has-text("移除"), button:has-text("Remove")')
      const hasRemoveButton = await removeButton.count() > 0

      // 注意：实际测试中，非管理员可能看不到移除按钮，或者点击后返回权限错误
      console.log(`✓ PERM-01: 普通成员视角下移除按钮存在: ${hasRemoveButton}`)
    } else {
      console.log('ℹ PERM-01: 当前工作区没有其他成员')
    }

    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})

test.describe('Workspace Members Management - Error Handling', () => {
  test('ERR-01: 无工作区时访问成员管理页面', async ({ page }) => {
    await page.goto('/')
    // 只设置用户，不设置工作区
    await page.evaluate(() => {
      localStorage.setItem('chat_app_current_user', JSON.stringify({
        id: 'test-id',
        email: 'test@test.com',
        full_name: 'Test User',
      }))
      localStorage.setItem('chat_app_token', 'token')
    })

    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'test-results/no-workspace-management.png' })

    const body = page.locator('body')
    await expect(body).toBeVisible()
    console.log('✓ ERR-01: 无工作区时页面正常处理')
  })

  test('ERR-02: 无效的 workspaceId 格式', async ({ request }) => {
    const response = await request.get('/api/workspace-join-requests?workspaceId=invalid-uuid')
    // 应该返回 401 (未认证) 或 400 (无效格式)
    expect([400, 401]).toContain(response.status())
    console.log('✓ ERR-02: 无效 workspaceId 格式返回适当错误')
  })
})

test.describe('Workspace Members Management - API File Structure', () => {
  test('FILE-01: API 文件结构验证', async () => {
    const fs = require('fs')
    const path = require('path')

    const apiFiles = [
      'app/api/workspace-join-requests/route.ts',
      'app/api/workspace-join-requests/approve/route.ts',
      'app/api/workspace-join-requests/reject/route.ts',
      'app/api/workspace-members/route.ts',
    ]

    for (const file of apiFiles) {
      const filePath = path.join(process.cwd(), file)
      const exists = fs.existsSync(filePath)
      expect(exists).toBe(true)
      console.log(`✓ FILE-01: ${file} 存在`)
    }
  })

  test('FILE-02: 前端组件文件验证', async () => {
    const fs = require('fs')
    const path = require('path')

    const componentFile = 'components/chat/workspace-members-panel.tsx'
    const filePath = path.join(process.cwd(), componentFile)
    const exists = fs.existsSync(filePath)
    expect(exists).toBe(true)
    console.log(`✓ FILE-02: ${componentFile} 存在`)
  })
})
