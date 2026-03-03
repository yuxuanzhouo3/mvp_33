import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000'
const email = process.env.E2E_EMAIL || 'gan2@example.com'
const password = process.env.E2E_PASSWORD || 'test123456'
const runTag = process.argv[2] || 'chat-e2e'
const outputDir = path.resolve(process.cwd(), 'screenshots', 'mobile-e2e')

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

async function suppressDevOverlay(page) {
  try {
    await page.addStyleTag({
      content: `
        nextjs-portal { display: none !important; }
        [data-nextjs-dev-overlay] { display: none !important; }
      `,
    })
  } catch {}
}

async function waitForWorkspaceAndEnter(page) {
  const cards = page.locator('button.w-full.justify-between.h-auto.p-3')
  if ((await cards.count()) === 0) return false
  try {
    await cards.first().click({ timeout: 3000 })
    return true
  } catch {
    try {
      await cards.first().click({ timeout: 3000, force: true })
      return true
    } catch {
      return false
    }
  }
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 15000 })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.locator('form button[type="submit"]').click()

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('/chat') || url.includes('/contacts')) return

    const entered = await waitForWorkspaceAndEnter(page)
    if (entered) {
      await page.waitForTimeout(1000)
      return
    }

    const loginError = page.locator('p.text-sm.text-destructive')
    if ((await loginError.count()) > 0) {
      throw new Error(`Login failed: ${(await loginError.first().textContent()) || 'unknown error'}`)
    }
    await page.waitForTimeout(300)
  }
}

async function metrics(page) {
  return page.evaluate(() => {
    const html = document.documentElement
    const body = document.body
    const listPanel = document.querySelector('[data-testid="chat-list-panel"]')
    const detailPanel = document.querySelector('[data-testid="chat-detail-panel"]')
    const nav = document.querySelector('nav')

    const visible = (el) => {
      if (!(el instanceof HTMLElement)) return false
      const style = window.getComputedStyle(el)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        el.getClientRects().length > 0
      )
    }

    const width = (el) => {
      if (!(el instanceof HTMLElement)) return 0
      return Math.round(el.getBoundingClientRect().width)
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      url: window.location.pathname + window.location.search,
      hasHorizontalOverflow: html.scrollWidth > window.innerWidth || body.scrollWidth > window.innerWidth,
      listPanelVisible: visible(listPanel),
      detailPanelVisible: visible(detailPanel),
      listPanelWidth: width(listPanel),
      detailPanelWidth: width(detailPanel),
      bottomNavVisible: visible(nav),
    }
  })
}

async function clickIfExists(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector)
    if ((await locator.count()) > 0) {
      const first = locator.first()
      const isVisible = await first.isVisible().catch(() => false)
      if (!isVisible) {
        continue
      }
      try {
        await first.click({ timeout: 5000 })
      } catch {
        await first.click({ force: true })
      }
      return selector
    }
  }
  return null
}

async function main() {
  await ensureDir(outputDir)
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const steps = []

  try {
    await login(page)
    await page.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded' })
    await suppressDevOverlay(page)
    await page.waitForSelector('[data-testid="chat-list-panel"]', { timeout: 15000 }).catch(() => null)
    await page.waitForTimeout(1000)

    steps.push({ step: 'open_chat', metrics: await metrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-01-open-chat.png`), fullPage: true })

    const itemSel = await clickIfExists(page, [
      '[data-testid="chat-conversation-item"]',
      '[data-testid="chat-list-panel"] button',
    ])
    await page.waitForTimeout(800)
    steps.push({ step: 'click_conversation', selector: itemSel, metrics: await metrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-02-chat-detail.png`), fullPage: true })

    const backSel = await clickIfExists(page, [
      'button[aria-label="Open conversation list"]',
      'button[aria-label="打开会话列表"]',
      'button:has-text("Back to conversations")',
      'button:has-text("返回会话列表")',
    ])
    await page.waitForTimeout(800)
    steps.push({ step: 'back_to_list', selector: backSel, metrics: await metrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-03-back-list.png`), fullPage: true })

    const navToContactsStart = Date.now()
    const navContactsSel = await clickIfExists(page, [
      'nav a:has-text("联系人")',
      'nav a:has-text("Contacts")',
    ])
    if (navContactsSel) {
      await page.waitForURL('**/contacts**', { timeout: 10000 }).catch(() => null)
    }
    const navToContactsMs = Date.now() - navToContactsStart
    await page.waitForTimeout(500)
    steps.push({
      step: 'switch_to_contacts',
      selector: navContactsSel,
      switchDurationMs: navToContactsMs,
      metrics: await metrics(page),
    })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-04-contacts.png`), fullPage: true })

    const navToChatStart = Date.now()
    const navChatSel = await clickIfExists(page, [
      'nav a:has-text("消息")',
      'nav a:has-text("Messages")',
    ])
    if (navChatSel) {
      await page.waitForURL('**/chat**', { timeout: 10000 }).catch(() => null)
    }
    const navToChatMs = Date.now() - navToChatStart
    await page.waitForTimeout(700)
    steps.push({
      step: 'switch_back_to_chat',
      selector: navChatSel,
      switchDurationMs: navToChatMs,
      metrics: await metrics(page),
    })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-05-back-chat.png`), fullPage: true })

    const report = {
      runTag,
      baseUrl,
      email,
      steps,
      generatedAt: new Date().toISOString(),
    }
    const reportPath = path.join(outputDir, `${runTag}-report.json`)
    await writeJson(reportPath, report)
    console.log(`[chat-e2e] report: ${reportPath}`)
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[chat-e2e] failed:', error)
  process.exitCode = 1
})
