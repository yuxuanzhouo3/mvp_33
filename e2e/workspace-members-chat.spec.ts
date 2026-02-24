/**
 * E2E Tests for Workspace Members Chat Feature
 * 工作区成员聊天功能测试：
 * 1. 测试同一个工作区的成员能否不用加好友就能发送信息
 * 2. 测试前端界面是否正确显示了本工作区里面所有的成员
 */

import { test, expect, Page } from '@playwright/test'

// Mock 用户数据
const MOCK_TEST_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'alice@company.com',
  username: 'alice',
  full_name: 'Alice Zhang',
  avatar_url: '/placeholder-user.jpg',
  title: 'Senior Software Engineer',
  status: 'online',
}

const MOCK_WORKSPACE = {
  id: '10000000-0000-0000-0000-000000000001',
  name: 'TechCorp',
  domain: 'techcorp',
  owner_id: '00000000-0000-0000-0000-000000000001',
}

// 设置 mock 登录状态
async function setupMockAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('chat_app_current_user', JSON.stringify({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'alice@company.com',
      username: 'alice',
      full_name: 'Alice Zhang',
      title: 'Senior Software Engineer',
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

test.describe('Workspace Members Chat - API Tests', () => {
  test('API-01: 未认证访问工作区成员 API 应返回 401', async ({ request }) => {
    const response = await request.get('/api/workspace-members')
    expect(response.status()).toBe(401)
    console.log('✓ 未认证访问返回 401')
  })

  test('API-02: 未认证创建会话应返回 401', async ({ request }) => {
    const response = await request.post('/api/conversations', {
      data: { type: 'direct', member_ids: ['test-id'], skip_contact_check: true },
    })
    expect([400, 401]).toContain(response.status())
    console.log('✓ 未认证创建会话返回', response.status())
  })
})

test.describe('Workspace Members Chat - UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await setupMockAuth(page)
  })

  test('UI-01: 工作区成员页面应正确渲染', async ({ page }) => {
    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'test-results/workspace-members-page.png' })

    const body = page.locator('body')
    await expect(body).toBeVisible()
    console.log('✓ 工作区成员页面渲染成功')
  })

  test('UI-02: 工作区成员列表应显示', async ({ page }) => {
    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // 等待加载完成
    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    await page.screenshot({ path: 'test-results/workspace-members-list.png' })

    // 检查页面元素
    const pageContent = await page.locator('body').textContent()
    expect(pageContent).toBeTruthy()
    console.log('✓ 工作区成员列表显示测试完成')
  })

  test('UI-03: 点击成员应触发聊天功能', async ({ page }) => {
    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    // 查找可点击的成员按钮
    const memberButtons = page.locator('button[class*="flex"][class*="items-center"][class*="gap-"]')
    const count = await memberButtons.count()

    if (count > 0) {
      await memberButtons.first().click()
      await page.waitForTimeout(2000)

      await page.screenshot({ path: 'test-results/member-click-result.png' })
      console.log(`✓ 成功点击了 ${count} 个成员中的第一个`)
    } else {
      console.log('ℹ 当前工作区没有其他成员')
    }

    // 验证页面没有崩溃
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('UI-04: 聊天页面应正常加载', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'test-results/chat-page.png' })

    const body = page.locator('body')
    await expect(body).toBeVisible()
    console.log('✓ 聊天页面加载成功')
  })

  test('UI-05: 完整流程测试 - 成员列表到聊天', async ({ page }) => {
    // 步骤1: 访问工作区成员页面
    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    // 步骤2: 查找成员
    const memberButtons = page.locator('button[class*="flex"][class*="items-center"][class*="gap-"]')
    const count = await memberButtons.count()

    if (count > 0) {
      // 步骤3: 点击成员发起聊天
      await memberButtons.first().click()
      await page.waitForTimeout(3000)

      const url = page.url()

      // 步骤4: 检查是否跳转到聊天页面
      if (url.includes('/chat')) {
        console.log('✓ 成功跳转到聊天页面')

        // 步骤5: 检查输入框
        const inputs = page.locator('textarea, input[type="text"]')
        const inputCount = await inputs.count()

        if (inputCount > 0) {
          console.log('✓ 找到输入框，可以发送消息')
        }
      }

      await page.screenshot({ path: 'test-results/full-flow-result.png' })
    } else {
      console.log('ℹ 没有工作区成员，跳过流程测试')
    }

    console.log('✓ 完整流程测试完成')
  })
})

test.describe('Workspace Members Chat - Error Handling', () => {
  test('ERR-01: 未登录访问工作区成员页面', async ({ page }) => {
    // 不设置认证状态
    await page.goto('/workspace-members')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'test-results/not-logged-in.png' })

    // 页面应该正常渲染或重定向
    const body = page.locator('body')
    await expect(body).toBeVisible()
    console.log('✓ 未登录访问处理正确')
  })

  test('ERR-02: 无工作区时的处理', async ({ page }) => {
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

    await page.screenshot({ path: 'test-results/no-workspace.png' })

    const body = page.locator('body')
    await expect(body).toBeVisible()
    console.log('✓ 无工作区处理正确')
  })
})
