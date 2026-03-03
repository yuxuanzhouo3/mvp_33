import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000'
const email = process.env.E2E_EMAIL || 'gan2@example.com'
const password = process.env.E2E_PASSWORD || 'test123456'
const runTag = process.argv[2] || 'audit'
const outputDir = path.resolve(process.cwd(), 'screenshots', 'mobile-adapt')

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
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

async function suppressDevOverlay(page) {
  try {
    await page.addStyleTag({
      content: `
        nextjs-portal { display: none !important; }
        [data-nextjs-dev-overlay] { display: none !important; }
      `,
    })
    await page.evaluate(() => {
      document.querySelectorAll('nextjs-portal').forEach((el) => {
        if (el instanceof HTMLElement) el.style.display = 'none'
      })
    })
  } catch {}
}

async function ensureChatPage(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 15000 })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.locator('form button[type="submit"]').click()

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('/chat')) {
      return
    }

    const enteredWorkspace = await waitForWorkspaceAndEnter(page)
    if (enteredWorkspace) {
      await page.waitForTimeout(1000)
      if (page.url().includes('/chat')) return
    }

    const loginError = page.locator('p.text-sm.text-destructive')
    if ((await loginError.count()) > 0) {
      const text = (await loginError.first().textContent()) || 'unknown login error'
      throw new Error(`Login failed: ${text}`)
    }

    await page.waitForTimeout(300)
  }

  throw new Error(`Timed out waiting for chat page, current URL: ${page.url()}`)
}

async function takeStep(page, steps, runTag, index, step, extra = {}) {
  await suppressDevOverlay(page)
  const metrics = await page.evaluate(() => {
    const html = document.documentElement
    const body = document.body
    const overlay = document.querySelector('div.fixed.inset-0.z-40')
    const nav = document.querySelector('nav')
    const visible = (el) => {
      if (!(el instanceof HTMLElement)) return false
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }

    const navElements = Array.from(document.querySelectorAll('nav a, nav button'))
    const navItems = navElements.map((item) => item.textContent?.trim() || '').filter(Boolean)
    const navHrefs = navElements
      .map((item) => {
        if (!(item instanceof HTMLAnchorElement)) return null
        return {
          text: item.textContent?.trim() || '',
          href: item.getAttribute('href') || '',
        }
      })
      .filter(Boolean)

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      url: window.location.pathname + window.location.search,
      hasHorizontalOverflow: html.scrollWidth > window.innerWidth || body.scrollWidth > window.innerWidth,
      htmlScrollWidth: html.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      mobileOverlayVisible: visible(overlay),
      mobileOverlayCount: document.querySelectorAll('div.fixed.inset-0.z-40').length,
      bottomNavVisible: visible(nav),
      bottomNavButtonTexts: navItems,
      bottomNavLinks: navHrefs,
    }
  })

  const snap = `${runTag}-${String(index).padStart(2, '0')}-${step}.png`
  await page.screenshot({ path: path.join(outputDir, snap), fullPage: true })
  steps.push({ step, screenshot: snap, metrics, ...extra })
}

async function closeMobileOverlay(page) {
  const overlay = page.locator('div.fixed.inset-0.z-40')
  if ((await overlay.count()) > 0) {
    await overlay.first().click({ position: { x: 12, y: 12 }, force: true })
    await page.waitForTimeout(500)
    return true
  }
  return false
}

async function clickBottomTab(page, labels, expectedPath) {
  const selectors = labels.flatMap((label) => [
    `nav.border-t a:has-text("${label}")`,
    `nav a:has-text("${label}")`,
    `nav.border-t button:has-text("${label}")`,
    `nav button:has-text("${label}")`,
  ])

  for (const selector of selectors) {
    const locator = page.locator(selector)
    if ((await locator.count()) > 0) {
      await suppressDevOverlay(page)
      try {
        await locator.first().click()
      } catch {
        await locator.first().click({ force: true })
      }

      if (expectedPath) {
        try {
          await page.waitForURL(`**${expectedPath}**`, { timeout: 15000 })
        } catch {
          return { selector, urlAfterClick: page.url(), navigated: false }
        }
      }

      return { selector, urlAfterClick: page.url(), navigated: true }
    }
  }
  return { selector: null, urlAfterClick: page.url(), navigated: false }
}

async function main() {
  await ensureDir(outputDir)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const steps = []

  try {
    await ensureChatPage(page)
    await page.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)

    await takeStep(page, steps, runTag, 1, 'chat-initial')

    const closedChatOverlay = await closeMobileOverlay(page)
    await takeStep(page, steps, runTag, 2, 'chat-after-close-overlay', { closedChatOverlay })

    const channelsResult = await clickBottomTab(page, ['频道', 'Channels'], '/channels')
    await page.waitForTimeout(1000)
    await takeStep(page, steps, runTag, 3, 'after-click-channels', channelsResult)

    const closedChannelsOverlay = await closeMobileOverlay(page)
    await takeStep(page, steps, runTag, 4, 'channels-after-close-overlay', { closedChannelsOverlay })

    const settingsResult = await clickBottomTab(page, ['设置', 'Settings'], '/settings')
    await page.waitForTimeout(1000)
    await takeStep(page, steps, runTag, 5, 'after-click-settings', settingsResult)

    const chatResult = await clickBottomTab(page, ['消息', 'Messages'], '/chat')
    await page.waitForTimeout(1000)
    await takeStep(page, steps, runTag, 6, 'after-click-chat', chatResult)

    const report = {
      runTag,
      baseUrl,
      email,
      steps,
      generatedAt: new Date().toISOString(),
    }

    const reportPath = path.join(outputDir, `${runTag}-report.json`)
    await writeJson(reportPath, report)
    console.log(`[mobile-audit] report: ${reportPath}`)
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[mobile-audit] failed:', error)
  process.exitCode = 1
})
