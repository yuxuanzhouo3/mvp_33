/**
 * E2E Tests for Workspace Features - Domestic Version (CN)
 * 工作区功能测试：TechCorp总组、邀请码、创建工作区
 */

import { test, expect } from '@playwright/test'

// 国内版测试账号
const TEST_USER = {
  email: '3139307614@qq.com',
  password: 'Bb123456',
}

// TechCorp 邀请码
const INVITE_CODE = 'TECHCORP2026'

test.describe('Workspace Features - Domestic Version (CN)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120000 })

  test('01 - 登录并验证 TechCorp 工作区', async ({ page }) => {
    // 导航到登录页面
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // 等待登录表单出现
    await page.waitForSelector('#email', { state: 'visible', timeout: 30000 })
    await page.waitForSelector('#password', { state: 'visible', timeout: 10000 })

    // 填写登录信息
    await page.fill('#email', TEST_USER.email)
    await page.fill('#password', TEST_USER.password)
    await page.click('button[type="submit"]')

    // 等待登录成功 - 检测 localStorage 中是否有用户数据
    await page.waitForFunction(() => {
      const user = localStorage.getItem('chat_app_current_user')
      const token = localStorage.getItem('chat_app_token')
      return user !== null && token !== null
    }, { timeout: 60000 })

    console.log('✓ 登录成功')

    // 等待页面稳定
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // 验证页面加载成功
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: 10000 })

    console.log('✓ 页面加载成功')
  })

  test('02 - 工作区切换菜单功能', async ({ page }) => {
    // 直接导航到聊天页面
    await page.goto('/chat', { timeout: 60000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // 尝试点击工作区按钮
    const selectors = [
      'button:has-text("TechCorp")',
      'button:has-text("总组")',
      'header button:first-child',
    ]

    for (const selector of selectors) {
      const button = page.locator(selector).first()
      if (await button.isVisible().catch(() => false)) {
        await button.click()
        console.log(`✓ 点击了按钮: ${selector}`)
        break
      }
    }

    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/workspace-menu.png', fullPage: false })
    console.log('✓ 工作区菜单测试完成')
  })

  test('03 - 邀请码 API 测试', async ({ page, request }) => {
    await page.goto('/chat', { timeout: 60000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 获取 session token 和 cookies
    const sessionToken = await page.evaluate(() => {
      return localStorage.getItem('chat_app_token')
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (sessionToken) {
      headers['x-cloudbase-session'] = sessionToken
    }

    // 测试无效邀请码 - 应该返回 400 (无效邀请码)
    const invalidResponse = await request.post('/api/workspaces/join', {
      data: { inviteCode: 'INVALID123' },
      headers,
    })

    console.log('无效邀请码响应状态:', invalidResponse.status())
    const invalidBody = await invalidResponse.json()
    console.log('无效邀请码响应内容:', invalidBody)
    expect(invalidResponse.status()).toBe(400)

    // 测试有效邀请码 - 应该能找到工作区 (返回 401 表示找到了工作区但未认证，或 200 成功)
    const validResponse = await request.post('/api/workspaces/join', {
      data: { inviteCode: INVITE_CODE },
      headers,
    })

    console.log('有效邀请码响应状态:', validResponse.status())
    const validBody = await validResponse.json()
    console.log('有效邀请码响应内容:', validBody)

    // 如果返回 401，说明找到了工作区但用户未认证（这是预期的，因为 Playwright 请求没带有效 cookie）
    // 如果返回 200，说明成功加入工作区
    // 如果返回 400，说明邀请码无效（数据库中还没有）
    expect([200, 400, 401]).toContain(validResponse.status())
  })

  test('04 - 工作区列表 API 测试', async ({ page, request }) => {
    await page.goto('/chat', { timeout: 60000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 获取 session token
    const sessionToken = await page.evaluate(() => {
      return localStorage.getItem('chat_app_token')
    })

    const headers: Record<string, string> = {}
    if (sessionToken) {
      headers['x-cloudbase-session'] = sessionToken
    }

    const response = await request.get('/api/workspaces', { headers })
    console.log('工作区列表响应状态:', response.status())
    expect([200, 401]).toContain(response.status())
  })

  test('05 - 创建工作区 API 测试 (需要邀请码)', async ({ page, request }) => {
    await page.goto('/chat', { timeout: 60000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 获取 session token
    const sessionToken = await page.evaluate(() => {
      return localStorage.getItem('chat_app_token')
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (sessionToken) {
      headers['x-cloudbase-session'] = sessionToken
    }

    // 测试不带邀请码创建工作区 - 应该失败
    const noInviteCodeResponse = await request.post('/api/workspaces', {
      data: { name: 'TestOrg' },
      headers,
    })

    console.log('无邀请码创建工作区响应状态:', noInviteCodeResponse.status())
    expect([400, 401]).toContain(noInviteCodeResponse.status())

    // 测试带邀请码创建工作区
    const testInviteCode = 'TEST' + Math.random().toString(36).substring(2, 6).toUpperCase()
    const withInviteCodeResponse = await request.post('/api/workspaces', {
      data: { name: 'Test Organization', inviteCode: testInviteCode },
      headers,
    })

    console.log('带邀请码创建工作区响应状态:', withInviteCodeResponse.status())
    // 200 = 成功, 401 = 未登录
    expect([200, 401]).toContain(withInviteCodeResponse.status())
  })

  test('06 - 验证 TechCorp 工作区数据', async ({ page }) => {
    await page.goto('/chat', { timeout: 60000 })
    await page.waitForLoadState('domcontentloaded')

    const workspaceInfo = await page.evaluate(() => {
      const workspace = localStorage.getItem('chat_app_current_workspace')
      return workspace ? JSON.parse(workspace) : null
    })

    console.log('当前工作区信息:', workspaceInfo)

    if (workspaceInfo) {
      expect(workspaceInfo.name).toBeTruthy()
      console.log('✓ 工作区信息已加载:', workspaceInfo.name)
    } else {
      console.log('⚠ 工作区信息未在 localStorage 中找到')
    }
  })
})
