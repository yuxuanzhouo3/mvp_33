import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000'
const email = process.env.E2E_EMAIL || 'gan2@example.com'
const password = process.env.E2E_PASSWORD || 'test123456'
const runTag = process.argv[2] || 'contacts-e2e'
const outputDir = path.resolve(process.cwd(), 'screenshots', 'mobile-e2e')

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

async function waitForWorkspaceAndEnter(page) {
  const cards = page.locator('button.w-full.justify-between.h-auto.p-3')
  if ((await cards.count()) === 0) return false
  await cards.first().click()
  return true
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

async function loginAndOpenContacts(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 15000 })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.locator('form button[type="submit"]').click()

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('/chat') || url.includes('/contacts')) break

    const enteredWorkspace = await waitForWorkspaceAndEnter(page)
    if (enteredWorkspace) {
      await page.waitForTimeout(1000)
      break
    }

    const loginError = page.locator('p.text-sm.text-destructive')
    if ((await loginError.count()) > 0) {
      throw new Error(`Login failed: ${(await loginError.first().textContent()) || 'unknown error'}`)
    }

    await page.waitForTimeout(300)
  }

  await page.goto(`${baseUrl}/contacts`, { waitUntil: 'domcontentloaded' })
  await suppressDevOverlay(page)
  await page.waitForTimeout(1200)
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const html = document.documentElement
    const body = document.body
    const listPanel = document.querySelector('div.flex.min-w-0.flex-col')
    const detailPanel = document.querySelector('div.min-w-0.flex-1.flex-col.flex')
    const bottomNav = document.querySelector('nav')

    const visible = (el) => {
      if (!(el instanceof HTMLElement)) return false
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow: html.scrollWidth > window.innerWidth || body.scrollWidth > window.innerWidth,
      htmlScrollWidth: html.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      listPanelVisible: visible(listPanel),
      detailPanelVisible: visible(detailPanel),
      bottomNavVisible: visible(bottomNav),
      url: window.location.pathname + window.location.search,
    }
  })
}

async function clickIfExists(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector)
    if ((await locator.count()) > 0) {
      await suppressDevOverlay(page)
      await locator.first().click({ force: true })
      return selector
    }
  }
  return null
}

async function closeGlobalOverlayIfExists(page) {
  const overlay = page.locator('div.fixed.inset-0.z-40')
  if ((await overlay.count()) > 0) {
    await overlay.first().click({ position: { x: 10, y: 10 }, force: true })
    await page.waitForTimeout(500)
  }
}

async function main() {
  await ensureDir(outputDir)
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  const steps = []

  try {
    await loginAndOpenContacts(page)
    steps.push({ step: 'open_contacts', metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-01-contacts-open.png`), fullPage: true })

    const requestsSelector = await clickIfExists(page, [
      'button[role="tab"]:has-text("Requests")',
      'button[role="tab"]:has-text("请求")',
    ])
    await page.waitForTimeout(500)
    steps.push({ step: 'click_requests_tab', selector: requestsSelector, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-02-requests-tab.png`), fullPage: true })

    const historySelector = await clickIfExists(page, [
      'button[role="tab"]:has-text("历史记录")',
      'button[role="tab"]:has-text("History")',
    ])
    await page.waitForTimeout(500)
    steps.push({ step: 'click_history_tab', selector: historySelector, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-03-history-tab.png`), fullPage: true })

    await clickIfExists(page, [
      'button[role="tab"]:has-text("All")',
      'button[role="tab"]:has-text("全部")',
    ])
    await page.waitForTimeout(300)

    await page.waitForSelector(
      'button.w-full.flex.items-center.gap-3.rounded-lg.p-3.text-left',
      { timeout: 10000 }
    ).catch(() => null)

    const contactClicked = await clickIfExists(page, [
      'div.p-2 button.w-full.flex.items-center.gap-3.rounded-lg.p-3.text-left',
      'button.w-full.flex.items-center.gap-3.rounded-lg.p-3.text-left',
    ])
    await page.waitForTimeout(700)
    steps.push({ step: 'click_contact_item', selector: contactClicked, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-04-contact-detail.png`), fullPage: true })

    const backClicked = await clickIfExists(page, [
      'button[aria-label="返回联系人列表"]',
      'button[aria-label="Back to contacts"]',
    ])
    await page.waitForTimeout(500)
    steps.push({ step: 'click_back_to_list', selector: backClicked, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-05-back-list.png`), fullPage: true })

    const navChannels = await clickIfExists(page, [
      'nav a:has-text("频道")',
      'nav a:has-text("Channels")',
      'nav button:has-text("频道")',
      'nav button:has-text("Channels")',
    ])
    if (navChannels) {
      await page.waitForURL('**/channels**', { timeout: 10000 }).catch(() => null)
    }
    await page.waitForTimeout(1200)
    steps.push({ step: 'click_bottom_channels', selector: navChannels, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-06-channels-page.png`), fullPage: true })

    await closeGlobalOverlayIfExists(page)
    const navContacts = await clickIfExists(page, [
      'nav a:has-text("联系人")',
      'nav a:has-text("Contacts")',
      'nav button:has-text("联系人")',
      'nav button:has-text("Contacts")',
    ])
    await page.waitForTimeout(1200)
    if (!page.url().includes('/contacts')) {
      await page.goto(`${baseUrl}/contacts`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
    }
    steps.push({ step: 'click_bottom_contacts', selector: navContacts, metrics: await pageMetrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-07-back-contacts.png`), fullPage: true })

    const report = {
      runTag,
      baseUrl,
      email,
      steps,
      generatedAt: new Date().toISOString(),
    }

    const reportPath = path.join(outputDir, `${runTag}-report.json`)
    await writeJson(reportPath, report)
    console.log(`[contacts-e2e] report: ${reportPath}`)
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[contacts-e2e] failed:', error)
  process.exitCode = 1
})
