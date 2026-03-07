import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000'
const email = process.env.E2E_EMAIL || 'gan2@example.com'
const password = process.env.E2E_PASSWORD || 'test123456'
const runTag = process.argv[2] || 'channels-e2e'
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
      await cards.first().click({ force: true, timeout: 3000 })
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
    if (url.includes('/chat') || url.includes('/channels')) break
    const entered = await waitForWorkspaceAndEnter(page)
    if (entered) {
      await page.waitForTimeout(1000)
      break
    }
    const loginError = page.locator('p.text-sm.text-destructive')
    if ((await loginError.count()) > 0) {
      throw new Error(`Login failed: ${(await loginError.first().textContent()) || 'unknown error'}`)
    }
    await page.waitForTimeout(300)
  }
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const html = document.documentElement
    const body = document.body
    const listPanel = document.querySelector('[data-testid="channels-list-panel"]')
    const detailPanel = document.querySelector('[data-testid="channels-detail-panel"]')
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
      try {
        await locator.first().click({ timeout: 5000 })
      } catch {
        await locator.first().click({ force: true })
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
    await page.goto(`${baseUrl}/channels`, { waitUntil: 'domcontentloaded' })
    if (page.url().includes('/login')) {
      throw new Error('Redirected to /login when opening /channels. Please check server/session.')
    }
    await suppressDevOverlay(page)
    await page.waitForSelector('[data-testid="channels-list-panel"]', { timeout: 15000 }).catch(() => null)
    await page.waitForTimeout(1000)

    steps.push({ step: 'open_channels', metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-01-open.png`), fullPage: true })

    await page.waitForSelector('[data-testid="channels-item"]', { timeout: 10000 }).catch(() => null)
    const channelItem = await clickIfExists(page, [
      '[data-testid="channels-item"]',
      '[data-testid="channels-list-panel"] button',
    ])
    await page.waitForTimeout(700)
    steps.push({ step: 'click_channel_item', selector: channelItem, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-02-detail.png`), fullPage: true })

    const backToList = await clickIfExists(page, [
      'button[aria-label="返回频道列表"]',
      'button[aria-label="Back to channels"]',
      'button[aria-label="返回列表"]',
      'button[aria-label="Back"]',
      'button:has-text("返回频道列表")',
      'button:has-text("Back to channels")',
    ])
    await page.waitForTimeout(700)
    steps.push({ step: 'back_to_list', selector: backToList, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-03-back-list.png`), fullPage: true })

    const navSettings = await clickIfExists(page, [
      'nav a:has-text("设置")',
      'nav a:has-text("Settings")',
    ])
    if (navSettings) {
      await page.waitForURL('**/settings**', { timeout: 10000 }).catch(() => null)
    }
    await page.waitForTimeout(700)
    steps.push({ step: 'click_bottom_settings', selector: navSettings, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-04-settings.png`), fullPage: true })

    const navChannels = await clickIfExists(page, [
      'nav a:has-text("频道")',
      'nav a:has-text("Channels")',
    ])
    if (navChannels) {
      await page.waitForURL('**/channels**', { timeout: 10000 }).catch(() => null)
    }
    await page.waitForTimeout(900)
    steps.push({ step: 'click_bottom_channels', selector: navChannels, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-05-back-channels.png`), fullPage: true })

    const report = {
      runTag,
      baseUrl,
      email,
      steps,
      generatedAt: new Date().toISOString(),
    }
    const reportPath = path.join(outputDir, `${runTag}-report.json`)
    await writeJson(reportPath, report)
    console.log(`[channels-e2e] report: ${reportPath}`)
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[channels-e2e] failed:', error)
  process.exitCode = 1
})
