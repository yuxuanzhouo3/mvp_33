import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000'
const email = process.env.E2E_EMAIL || 'gan2@example.com'
const password = process.env.E2E_PASSWORD || 'test123456'
const runTag = process.argv[2] || 'chat-e2e'
const outputDir = path.resolve(process.cwd(), 'screenshots', 'mobile-e2e')
const mobileBackSelectors = [
  'button[aria-label="关闭公告"]',
  'button[aria-label="Close announcement"]',
  'button[aria-label="返回会话列表"]',
  'button[aria-label="Back to conversations"]',
  'button[aria-label="返回列表"]',
  'button[aria-label="Back"]',
  'button[aria-label="Open conversation list"]',
  'button[aria-label="打开会话列表"]',
  'button:has-text("Back to conversations")',
  'button:has-text("返回会话列表")',
]

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

async function openConversationWithComposer(page) {
  const conversationItems = page.locator('[data-testid="chat-conversation-item"]')
  const total = await conversationItems.count()
  if (total === 0) {
    return { found: false, reason: 'no-conversation-items' }
  }

  const candidates = Math.min(total, 12)
  for (let i = 0; i < candidates; i++) {
    const item = conversationItems.nth(i)
    const isVisible = await item.isVisible().catch(() => false)
    if (!isVisible) continue

    try {
      await item.click({ timeout: 5000 })
    } catch {
      await item.click({ force: true })
    }
    await page.waitForTimeout(900)

    const composer = page.locator('textarea')
    const hasComposer = (await composer.count()) > 0 && (await composer.first().isVisible().catch(() => false))
    if (hasComposer) {
      return { found: true, selectedIndex: i }
    }

    await clickIfExists(page, mobileBackSelectors)
    await page.waitForTimeout(450)
  }

  return { found: false, reason: 'no-conversation-with-composer' }
}

async function runQQChatValidation(page) {
  const result = {
    eligible: false,
    selectedIndex: -1,
    disabledAfterSecondType: null,
    sentMessagesFound: 0,
    sentMessagesWithAvatar: 0,
    minSentBubbleWidth: 0,
    maxSentBubbleWidthRatio: 0,
    ownBubbleToAvatarGapMin: null,
    ownBubbleToAvatarGapMax: null,
    ownBubbleToAvatarGapVariance: null,
    ownBubbleBlueTone: null,
    peerBubbleNearWhite: null,
  }

  const openResult = await openConversationWithComposer(page)
  if (!openResult.found) {
    return { ...result, reason: openResult.reason || 'unknown' }
  }

  result.eligible = true
  result.selectedIndex = openResult.selectedIndex ?? -1

  const textarea = page.locator('textarea').first()
  const sendBtnByTestId = page.locator('[data-testid="chat-composer-send-button"]').first()
  const sendBtnFallback = page.locator('button:has-text("发送"), button:has-text("Send")').last()
  const sendButton = (await sendBtnByTestId.count()) > 0 ? sendBtnByTestId : sendBtnFallback

  const uniq = Date.now()
  const m1 = `qq-ui-a-${uniq}`
  const m2 = `qq-ui-b-${uniq} medium`
  const m3 = `qq-ui-c-${uniq} long message to verify fixed gap between own bubble and avatar on mobile layout`
  const sentMessages = [m1, m2, m3]

  await textarea.fill(m1)
  await sendButton.click()
  await page.waitForTimeout(140)

  await textarea.fill(m2)
  result.disabledAfterSecondType = await sendButton.isDisabled().catch(() => null)
  await sendButton.click()
  await page.waitForTimeout(140)

  await textarea.fill(m3)
  await sendButton.click()
  await page.waitForTimeout(1300)

  const inspection = await page.evaluate((messages) => {
    const viewportWidth = window.innerWidth

    const parseRgb = (color) => {
      const match = color && color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
      if (!match) return null
      return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
    }

    const ownBubble = document.querySelector('[data-testid="chat-message-bubble"][data-message-side="own"]')
    const peerBubble = document.querySelector('[data-testid="chat-message-bubble"][data-message-side="peer"]')
    const ownColorRaw = ownBubble ? window.getComputedStyle(ownBubble).backgroundColor : ''
    const peerColorRaw = peerBubble ? window.getComputedStyle(peerBubble).backgroundColor : ''
    const ownRgb = parseRgb(ownColorRaw)
    const peerRgb = parseRgb(peerColorRaw)

    const ownBubbleBlueTone = ownRgb
      ? !!(ownRgb.b >= 180 && ownRgb.b > ownRgb.r && ownRgb.b > ownRgb.g)
      : null
    const peerBubbleNearWhite = peerRgb
      ? !!(peerRgb.r >= 230 && peerRgb.g >= 230 && peerRgb.b >= 230)
      : null

    const perSent = messages.map((msg) => {
      const bubble = Array.from(document.querySelectorAll('[data-testid="chat-message-bubble"]'))
        .find((el) => (el.textContent || '').includes(msg))
      if (!bubble) {
        return {
          message: msg,
          found: false,
          hasAvatar: false,
          bubbleWidth: 0,
          bubbleWidthRatio: 0,
          ownBubbleToAvatarGap: null,
        }
      }
      const row = bubble.closest('[data-testid="chat-message-row"]')
      const avatar = row?.querySelector('[data-testid="chat-message-avatar"]')
      const hasAvatar = !!avatar
      const bubbleRect = bubble.getBoundingClientRect()
      const avatarRect = avatar?.getBoundingClientRect()
      const side = row?.getAttribute('data-message-side') || ''
      const ownBubbleToAvatarGap = side === 'own' && avatarRect
        ? Number((avatarRect.left - bubbleRect.right).toFixed(2))
        : null
      return {
        message: msg,
        found: true,
        hasAvatar,
        bubbleWidth: Math.round(bubbleRect.width),
        bubbleWidthRatio: Number((bubbleRect.width / viewportWidth).toFixed(4)),
        ownBubbleToAvatarGap,
      }
    })

    const foundItems = perSent.filter((x) => x.found)
    const widths = foundItems.map((x) => x.bubbleWidth)
    const ratios = foundItems.map((x) => x.bubbleWidthRatio)
    const ownGaps = foundItems
      .map((x) => x.ownBubbleToAvatarGap)
      .filter((v) => typeof v === 'number')
    const ownBubbleToAvatarGapMin = ownGaps.length ? Math.min(...ownGaps) : null
    const ownBubbleToAvatarGapMax = ownGaps.length ? Math.max(...ownGaps) : null
    const ownBubbleToAvatarGapVariance =
      ownBubbleToAvatarGapMin !== null && ownBubbleToAvatarGapMax !== null
        ? Number((ownBubbleToAvatarGapMax - ownBubbleToAvatarGapMin).toFixed(2))
        : null

    return {
      perSent,
      sentMessagesFound: foundItems.length,
      sentMessagesWithAvatar: foundItems.filter((x) => x.hasAvatar).length,
      minSentBubbleWidth: widths.length ? Math.min(...widths) : 0,
      maxSentBubbleWidthRatio: ratios.length ? Math.max(...ratios) : 0,
      ownBubbleToAvatarGapMin,
      ownBubbleToAvatarGapMax,
      ownBubbleToAvatarGapVariance,
      ownBubbleBlueTone,
      peerBubbleNearWhite,
      ownColorRaw,
      peerColorRaw,
    }
  }, sentMessages)

  Object.assign(result, inspection)

  if (result.disabledAfterSecondType === true) {
    throw new Error('Send button became disabled while sending consecutive messages.')
  }
  if (result.sentMessagesFound < 3) {
    throw new Error(`Expected 3 sent messages to appear, got ${result.sentMessagesFound}.`)
  }
  if (result.sentMessagesWithAvatar < 3) {
    throw new Error(`Expected each sent message to have avatar, got ${result.sentMessagesWithAvatar}/3.`)
  }
  if (result.minSentBubbleWidth < 82) {
    throw new Error(`Sent bubble min width too small: ${result.minSentBubbleWidth}px.`)
  }
  if (result.maxSentBubbleWidthRatio > 0.72) {
    throw new Error(`Sent bubble width ratio too large: ${result.maxSentBubbleWidthRatio}.`)
  }
  if (result.ownBubbleToAvatarGapVariance === null) {
    throw new Error('Unable to measure own bubble-to-avatar gaps.')
  }
  if (result.ownBubbleToAvatarGapVariance > 2) {
    throw new Error(
      `Own bubble-to-avatar gap is unstable: variance ${result.ownBubbleToAvatarGapVariance}px (min ${result.ownBubbleToAvatarGapMin}px, max ${result.ownBubbleToAvatarGapMax}px).`
    )
  }
  if (result.ownBubbleBlueTone === false) {
    throw new Error('Own bubble is not in expected blue tone.')
  }
  if (result.peerBubbleNearWhite === false) {
    throw new Error('Peer bubble is not near white.')
  }

  return result
}

async function runOfficialChannelsScrollValidation(page) {
  const result = {
    eligible: false,
    foundPanel: false,
    foundAnnouncementButton: false,
    scrollDelta: 0,
    announcementTopBefore: null,
    announcementTopAfter: null,
    announcementTopDelta: null,
  }

  const panel = page.locator('[data-testid="official-channels-panel"]').first()
  if ((await panel.count()) === 0) {
    return { ...result, reason: 'official-channels-panel-not-found' }
  }
  result.foundPanel = true

  const announcementButton = page.locator('[data-testid="official-channel-announcement"]').first()
  if ((await announcementButton.count()) === 0) {
    return { ...result, reason: 'official-channel-announcement-not-found' }
  }
  result.foundAnnouncementButton = true
  result.eligible = true

  const measured = await page.evaluate(async () => {
    const listPanel = document.querySelector('[data-testid="chat-list-panel"]')
    if (!listPanel) {
      return { ok: false, reason: 'chat-list-panel-not-found' }
    }

    const viewport = listPanel.querySelector('[data-slot="scroll-area-viewport"], [data-radix-scroll-area-viewport]')
    if (!(viewport instanceof HTMLElement)) {
      return { ok: false, reason: 'scroll-area-viewport-not-found' }
    }

    const btn = listPanel.querySelector('[data-testid="official-channel-announcement"]')
    if (!(btn instanceof HTMLElement)) {
      return { ok: false, reason: 'official-announcement-button-not-found' }
    }

    const beforeTop = btn.getBoundingClientRect().top
    const beforeScrollTop = viewport.scrollTop
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    const targetScrollTop = Math.min(maxScrollTop, beforeScrollTop + 240)
    viewport.scrollTop = targetScrollTop
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }))

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const afterTop = btn.getBoundingClientRect().top
    const afterScrollTop = viewport.scrollTop

    return {
      ok: true,
      beforeTop: Number(beforeTop.toFixed(2)),
      afterTop: Number(afterTop.toFixed(2)),
      topDelta: Number((afterTop - beforeTop).toFixed(2)),
      scrollDelta: Number((afterScrollTop - beforeScrollTop).toFixed(2)),
    }
  })

  if (!measured.ok) {
    return { ...result, reason: measured.reason || 'scroll-measurement-failed' }
  }

  result.scrollDelta = measured.scrollDelta
  result.announcementTopBefore = measured.beforeTop
  result.announcementTopAfter = measured.afterTop
  result.announcementTopDelta = measured.topDelta

  if (result.scrollDelta < 20) {
    throw new Error(`Official channels scroll distance too small to validate: ${result.scrollDelta}px.`)
  }
  if (result.announcementTopDelta === null || Math.abs(result.announcementTopDelta) < 8) {
    throw new Error(
      `Official channels appear fixed. Expected noticeable vertical movement, got ${result.announcementTopDelta}px.`
    )
  }

  return result
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

    const officialChannelsValidation = await runOfficialChannelsScrollValidation(page)
    steps.push({ step: 'official_channels_scroll_validation', validation: officialChannelsValidation, metrics: await metrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-01b-official-channels-scroll.png`), fullPage: true })

    const itemSel = await clickIfExists(page, [
      '[data-testid="chat-conversation-item"]',
      'button:has-text("Global Announcement")',
      'button:has-text("全局公告")',
    ])
    await page.waitForTimeout(800)
    steps.push({ step: 'click_conversation', selector: itemSel, metrics: await metrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-02-chat-detail.png`), fullPage: true })

    const backSel = await clickIfExists(page, mobileBackSelectors)
    await page.waitForTimeout(800)
    steps.push({ step: 'back_to_list', selector: backSel, metrics: await metrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-03-back-list.png`), fullPage: true })

    const qqValidation = await runQQChatValidation(page)
    steps.push({ step: 'qq_ui_validation', validation: qqValidation, metrics: await metrics(page) })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-04-qq-ui-validation.png`), fullPage: true })

    await clickIfExists(page, mobileBackSelectors)
    await page.waitForTimeout(500)

    const navToContactsStart = Date.now()
    const navContactsSel = await clickIfExists(page, [
      'nav a:has-text("联系人")',
      'nav a:has-text("Contacts")',
    ])
    if (navContactsSel) {
      await page.waitForURL('**/contacts**', { timeout: 10000 }).catch(() => null)
    }
    if (!page.url().includes('/contacts')) {
      await page.goto(`${baseUrl}/contacts`, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForSelector('button[role="tab"], nav a:has-text("联系人"), nav a:has-text("Contacts")', {
      timeout: 12000,
    }).catch(() => null)
    const navToContactsMs = Date.now() - navToContactsStart
    await page.waitForTimeout(500)
    steps.push({
      step: 'switch_to_contacts',
      selector: navContactsSel,
      switchDurationMs: navToContactsMs,
      metrics: await metrics(page),
    })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-05-contacts.png`), fullPage: true })

    const navToChatStart = Date.now()
    const navChatSel = await clickIfExists(page, [
      'nav a:has-text("消息")',
      'nav a:has-text("Messages")',
    ])
    if (navChatSel) {
      await page.waitForURL('**/chat**', { timeout: 10000 }).catch(() => null)
    }
    if (!page.url().includes('/chat')) {
      await page.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForSelector('[data-testid="chat-list-panel"], nav a:has-text("消息"), nav a:has-text("Messages")', {
      timeout: 12000,
    }).catch(() => null)
    const navToChatMs = Date.now() - navToChatStart
    await page.waitForTimeout(700)
    steps.push({
      step: 'switch_back_to_chat',
      selector: navChatSel,
      switchDurationMs: navToChatMs,
      metrics: await metrics(page),
    })
    await page.screenshot({ path: path.join(outputDir, `${runTag}-06-back-chat.png`), fullPage: true })

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
