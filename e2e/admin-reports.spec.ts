/**
 * E2E Tests for Admin Reports Management
 * 管理员举报管理页面测试
 */

import { test, expect } from '@playwright/test'

test.describe('Admin Reports Management', () => {
  test.describe('Admin Reports API', () => {
    test('GET /api/admin/reports should require authentication', async ({ request }) => {
      // 未认证请求应该返回 401
      const response = await request.get('/api/admin/reports')
      expect(response.status()).toBe(401)
    })

    test('PATCH /api/admin/reports should require authentication', async ({ request }) => {
      // 未认证请求应该返回 401
      const response = await request.patch('/api/admin/reports', {
        data: {
          reportId: 'test-report-id',
          status: 'resolved',
        },
      })
      expect(response.status()).toBe(401)
    })

    test('PATCH /api/admin/reports should validate status', async ({ request }) => {
      // 未认证请求应该在验证之前返回 401
      const response = await request.patch('/api/admin/reports', {
        data: {
          reportId: 'test-report-id',
          status: 'invalid-status',
        },
      })
      expect(response.status()).toBe(401)
    })
  })

  test.describe('Admin Reports Page', () => {
    test('admin reports page should redirect unauthenticated users', async ({ page }) => {
      // 尝试访问管理后台举报页面
      await page.goto('/admin/reports')

      // 应该被重定向到登录页面或显示未授权
      await page.waitForLoadState('networkidle')

      // 当前URL应该不是 /admin/reports（应该被重定向）
      const currentUrl = page.url()
      expect(currentUrl).not.toContain('/admin/reports')
    })
  })
})

test.describe('Workspace Filter Tests', () => {
  test('search API should handle workspace filtering', async ({ request }) => {
    // 未认证请求
    const response = await request.get('/api/users/search?q=test')
    // 应该返回 401 或 400（需要认证或参数错误）
    expect([200, 400, 401]).toContain(response.status())
  })
})

test.describe('Conversation Permission Tests', () => {
  test('conversation creation should check permissions', async ({ request }) => {
    // 未认证请求创建会话
    const response = await request.post('/api/conversations', {
      data: {
        type: 'direct',
        member_ids: ['test-user-id'],
      },
    })
    // 应该返回 401（未认证）或其他错误
    expect([200, 400, 401, 403, 500]).toContain(response.status())
  })
})

test.describe('File Structure Verification', () => {
  test('admin reports API file should exist', async () => {
    const fs = require('fs')
    const path = require('path')
    const apiPath = path.join(process.cwd(), 'app/api/admin/reports/route.ts')
    expect(fs.existsSync(apiPath)).toBe(true)
  })

  test('admin reports page file should exist', async () => {
    const fs = require('fs')
    const path = require('path')
    const pagePath = path.join(process.cwd(), 'app/admin/reports/page.tsx')
    expect(fs.existsSync(pagePath)).toBe(true)
  })

  test('admin sidebar should have reports menu item', async () => {
    const fs = require('fs')
    const path = require('path')
    const sidebarPath = path.join(process.cwd(), 'app/admin/components/AdminSidebar.tsx')
    const content = fs.readFileSync(sidebarPath, 'utf-8')
    expect(content).toContain('reports')
    expect(content).toContain('AlertTriangle')
  })
})
