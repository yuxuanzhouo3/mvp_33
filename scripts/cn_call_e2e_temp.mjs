import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'https://orbital.mornscience.top'
const callerEmail = process.env.CALLER_EMAIL || '3139307614@qq.com'
const callerPassword = process.env.CALLER_PASSWORD || 'Bb123456'
const calleeEmail = process.env.CALLEE_EMAIL || '2326815976@qq.com'
const calleePassword = process.env.CALLEE_PASSWORD || 'Aa123456'

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '')
}

async function parseJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function loginByApi(context, page, email, password) {
  const res = await context.request.post(`${baseUrl}/api/auth/login`, {
    data: { email, password },
  })
  const body = await parseJson(res)
  if (!res.ok || !body?.success) {
    throw new Error(`api login failed for ${email}: status=${res.status()} body=${JSON.stringify(body)}`)
  }

  const currentCookies = await context.cookies(baseUrl)
  const hasSessionCookie = currentCookies.some((c) => c.name === 'cb_session')
  if (!hasSessionCookie && body?.token) {
    await context.addCookies([
      {
        name: 'cb_session',
        value: String(body.token),
        url: baseUrl,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ])
  }

  let workspace = null
  if (body?.token) {
    const wsRes = await context.request.get(`${baseUrl}/api/workspaces`, {
      headers: { 'x-cloudbase-session': String(body.token) },
    })
    const wsBody = await parseJson(wsRes)
    if (wsRes.ok && wsBody?.success && Array.isArray(wsBody?.workspaces) && wsBody.workspaces.length > 0) {
      workspace = wsBody.workspaces[0]
    }
  }

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ user, token, workspaceData }) => {
      if (user) localStorage.setItem('chat_app_current_user', JSON.stringify(user))
      if (token) localStorage.setItem('chat_app_token', String(token))
      if (workspaceData) localStorage.setItem('chat_app_current_workspace', JSON.stringify(workspaceData))
    },
    {
      user: body?.user || null,
      token: body?.token || '',
      workspaceData: workspace,
    }
  )

  await page.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded' })
  const deadline = Date.now() + 30000

  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('/chat') || url.includes('/contacts') || url.includes('/channels')) {
      return
    }

    const workspaceCards = page.locator('button.w-full.justify-between.h-auto.p-3')
    if ((await workspaceCards.count()) > 0) {
      await workspaceCards.first().click()
      await page.waitForTimeout(1200)
      continue
    }

    await page.waitForTimeout(300)
  }

  throw new Error(`post-login navigation timeout for ${email}, last url=${page.url()}`)
}

async function getCurrentUser(session, label) {
  const res = await session.get(`${baseUrl}/api/users/profile`)
  const body = await parseJson(res)
  if (!res.ok || !body?.user?.id) {
    throw new Error(`${label} failed to get profile: status=${res.status()} body=${JSON.stringify(body)}`)
  }
  return body.user
}

async function ensureDirectConversation(session, targetUserId) {
  const res = await session.post(`${baseUrl}/api/conversations`, {
    data: {
      type: 'direct',
      member_ids: [targetUserId],
      skip_contact_check: true,
    },
  })
  const body = await parseJson(res)
  const conversationId = String(body?.conversation?.id || '')
  if (!res.ok || !conversationId) {
    throw new Error(`failed to create/find direct conversation: status=${res.status()} body=${JSON.stringify(body)}`)
  }
  return conversationId
}

async function openConversation(page, conversationId) {
  await page.goto(`${baseUrl}/chat?conversation=${encodeURIComponent(conversationId)}`, {
    waitUntil: 'domcontentloaded',
  })
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    const workspaceCards = page.locator('button.w-full.justify-between.h-auto.p-3')
    if ((await workspaceCards.count()) > 0) {
      await workspaceCards.first().click()
      await page.waitForTimeout(1200)
      continue
    }

    const headerPhone = page.locator('div.border-b.bg-background button:has(svg.lucide-phone)').first()
    if ((await headerPhone.count()) > 0 && (await headerPhone.isVisible())) {
      return
    }

    if (page.url().includes('/login')) {
      throw new Error(`unexpected redirect to login while opening conversation ${conversationId}`)
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`failed to open conversation ${conversationId}, current url=${page.url()}`)
}

async function fetchMessages(session, conversationId) {
  const res = await session.get(`${baseUrl}/api/messages?conversationId=${encodeURIComponent(conversationId)}&_t=${Date.now()}`)
  const body = await parseJson(res)
  if (!res.ok || !body?.success || !Array.isArray(body?.messages)) {
    throw new Error(`failed to fetch messages: status=${res.status()} body=${JSON.stringify(body)}`)
  }
  return body.messages
}

function findLatestCallMessage(messages, callType, callerId, sinceMs) {
  const filtered = messages
    .filter((m) => m?.type === 'system')
    .filter((m) => String(m?.metadata?.call_type || '') === callType)
    .filter((m) => String(m?.metadata?.caller_id || '') === String(callerId))
    .filter((m) => {
      const ts = Date.parse(String(m?.created_at || ''))
      return Number.isFinite(ts) && ts >= sinceMs
    })
    .sort((a, b) => Date.parse(String(b?.created_at || '')) - Date.parse(String(a?.created_at || '')))

  return filtered[0] || null
}

async function waitForCallMessage(session, conversationId, callType, callerId, sinceMs, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const messages = await fetchMessages(session, conversationId)
    const callMessage = findLatestCallMessage(messages, callType, callerId, sinceMs)
    if (callMessage?.id) return callMessage
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
  throw new Error(`timeout waiting call message type=${callType}`)
}

async function waitForCallStatus(session, conversationId, messageId, expectedStatuses, timeoutMs = 20000) {
  const expected = new Set(expectedStatuses)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const messages = await fetchMessages(session, conversationId)
    const callMessage = messages.find((m) => String(m?.id || '') === String(messageId))
    const callStatus = String(callMessage?.metadata?.call_status || '')
    const callDuration = Number(callMessage?.metadata?.call_duration || 0)
    if (expected.has(callStatus)) {
      return { callStatus, callDuration, message: callMessage }
    }
    await new Promise((resolve) => setTimeout(resolve, 700))
  }

  throw new Error(`timeout waiting call_status in [${expectedStatuses.join(', ')}] for message ${messageId}`)
}

async function startCallFromHeader(page, callType) {
  const selector = callType === 'voice' ? 'button:has(svg.lucide-phone)' : 'button:has(svg.lucide-video)'
  const headerButton = page.locator(`div.border-b.bg-background ${selector}`).first()
  if ((await headerButton.count()) > 0) {
    await headerButton.waitFor({ state: 'visible', timeout: 20000 })
    await headerButton.click()
    return
  }

  const fallbackButton = page.locator(selector).first()
  await fallbackButton.waitFor({ state: 'visible', timeout: 20000 })
  await fallbackButton.click()
}

async function waitIncomingAndAccept(page, timeoutMs = 15000) {
  const dialog = page.locator('[role="dialog"]').filter({
    has: page.locator('button.h-16.w-16'),
  }).first()
  await dialog.waitFor({ state: 'visible', timeout: timeoutMs })
  const buttons = dialog.locator('button.h-16.w-16')
  await buttons.nth(1).click()
}

async function hangupFromDialog(page) {
  const dialog = page.locator('[role="dialog"]').filter({
    has: page.locator('button.h-16.w-16'),
  }).first()
  await dialog.waitFor({ state: 'visible', timeout: 15000 })
  const redHangup = dialog.locator('button.h-16.w-16').last()
  await redHangup.click()
}

async function runCallCase({
  callerPage,
  calleePage,
  callerSession,
  conversationId,
  callType,
  callerId,
  holdSeconds,
}) {
  const startedAt = Date.now()
  console.log(`[call:${callType}] start`)
  await startCallFromHeader(callerPage, callType)

  const callMessage = await waitForCallMessage(callerSession, conversationId, callType, callerId, startedAt)
  const callMessageId = String(callMessage.id)
  console.log(`[call:${callType}] message=${callMessageId}`)

  const popupStart = Date.now()
  await waitIncomingAndAccept(calleePage)
  const popupLatencyMs = Date.now() - popupStart
  console.log(`[call:${callType}] popupLatencyMs=${popupLatencyMs}`)

  const answered = await waitForCallStatus(callerSession, conversationId, callMessageId, ['answered'], 20000)
  console.log(`[call:${callType}] answered`)
  await callerPage.waitForTimeout(Math.max(holdSeconds, 1) * 1000)
  try {
    await hangupFromDialog(callerPage)
  } catch (error) {
    const messages = await fetchMessages(callerSession, conversationId)
    const callMessageNow = messages.find((m) => String(m?.id || '') === callMessageId)
    const nowStatus = String(callMessageNow?.metadata?.call_status || '')
    const nowDuration = Number(callMessageNow?.metadata?.call_duration || 0)
    throw new Error(
      `hangup button not found for ${callType}, status=${nowStatus}, duration=${nowDuration}, error=${String(error)}`
    )
  }

  const ended = await waitForCallStatus(callerSession, conversationId, callMessageId, ['ended', 'cancelled'], 20000)
  console.log(`[call:${callType}] finalStatus=${ended.callStatus}, duration=${ended.callDuration}`)
  return {
    callType,
    callMessageId,
    popupLatencyMs,
    answeredStatus: answered.callStatus,
    finalStatus: ended.callStatus,
    finalDuration: ended.callDuration,
    heldForSeconds: holdSeconds,
  }
}

async function main() {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
    ],
  })

  const contextCaller = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const contextCallee = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })

  await contextCaller.grantPermissions(['microphone', 'camera'], { origin: normalizedBaseUrl })
  await contextCallee.grantPermissions(['microphone', 'camera'], { origin: normalizedBaseUrl })

  const callerPage = await contextCaller.newPage()
  const calleePage = await contextCallee.newPage()

  const report = {
    baseUrl: normalizedBaseUrl,
    callerEmail,
    calleeEmail,
    startedAt: new Date().toISOString(),
    results: [],
  }

  try {
    await loginByApi(contextCaller, callerPage, callerEmail, callerPassword)
    await loginByApi(contextCallee, calleePage, calleeEmail, calleePassword)

    const callerUser = await getCurrentUser(contextCaller.request, 'caller')
    const calleeUser = await getCurrentUser(contextCallee.request, 'callee')

    const conversationId = await ensureDirectConversation(contextCaller.request, calleeUser.id)
    report.conversationId = conversationId
    report.callerUserId = callerUser.id
    report.calleeUserId = calleeUser.id

    await openConversation(callerPage, conversationId)
    await openConversation(calleePage, conversationId)

    const runCaseSafely = async (callType) => {
      try {
        const result = await runCallCase({
          callerPage,
          calleePage,
          callerSession: contextCaller.request,
          conversationId,
          callType,
          callerId: callerUser.id,
          holdSeconds: 12,
        })
        return { ok: true, ...result }
      } catch (error) {
        return {
          ok: false,
          callType,
          error: String(error),
        }
      }
    }

    const voiceResult = await runCaseSafely('voice')
    report.results.push(voiceResult)

    await callerPage.waitForTimeout(1800)
    await calleePage.waitForTimeout(1800)

    const videoResult = await runCaseSafely('video')
    report.results.push(videoResult)

    report.finishedAt = new Date().toISOString()
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await contextCaller.close()
    await contextCallee.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('[cn_call_e2e_temp] failed:', error)
  process.exitCode = 1
})
