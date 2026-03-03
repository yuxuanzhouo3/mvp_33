import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.BASE_URL || 'https://orbital.mornscience.top'
const callerEmail = process.env.CALLER_EMAIL || '3139307614@qq.com'
const callerPassword = process.env.CALLER_PASSWORD || 'Bb123456'
const calleeEmail = process.env.CALLEE_EMAIL || '2326815976@qq.com'
const calleePassword = process.env.CALLEE_PASSWORD || 'Aa123456'
const callCases = (process.env.CALL_CASES || 'voice,video')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter((item) => item === 'voice' || item === 'video')
const holdSeconds = Number(process.env.HOLD_SECONDS || 12)
const waitBetweenCasesMs = Number(process.env.WAIT_BETWEEN_CASES_MS || 1800)
const debugDir = path.resolve(process.cwd(), 'test-results', 'cn-call-e2e-temp')

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

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function capturePageState(page, tag) {
  await ensureDir(debugDir)
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_')
  const file = path.join(debugDir, `${Date.now()}-${safeTag}.png`)
  await page.screenshot({ path: file, fullPage: true })
  const state = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
    const visibleDialogs = dialogs.filter((node) => {
      if (!(node instanceof HTMLElement)) return false
      const s = window.getComputedStyle(node)
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
    })
    const bodyText = (document.body?.innerText || '').slice(0, 1200)
    const hasPhoneButton = !!document.querySelector('button:has(svg.lucide-phone)')
    const hasVideoButton = !!document.querySelector('button:has(svg.lucide-video)')
    const callControlButtons = Array.from(document.querySelectorAll('[role="dialog"] button.h-16.w-16')).length
    return {
      url: window.location.href,
      visibleDialogs: visibleDialogs.length,
      hasPhoneButton,
      hasVideoButton,
      callControlButtons,
      bodyText,
    }
  })
  return { file, state }
}

async function loginByUi(page, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  const emailInput = page.locator('#email, input[name="email"], input[type="email"]').first()
  const passwordInput = page.locator('#password, input[name="password"], input[type="password"]').first()
  await emailInput.waitFor({ state: 'visible', timeout: 30000 })
  await passwordInput.waitFor({ state: 'visible', timeout: 30000 })
  await emailInput.fill(email)
  await passwordInput.fill(password)
  await page.locator('form button[type="submit"]').first().click()

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

    const loginError = page.locator('p.text-sm.text-destructive')
    if ((await loginError.count()) > 0) {
      const errText = (await loginError.first().textContent()) || 'unknown error'
      throw new Error(`ui login failed for ${email}: ${errText}`)
    }

    await page.waitForTimeout(300)
  }

  throw new Error(`post-login navigation timeout for ${email}, last url=${page.url()}`)
}

async function loginByApiInjection(context, page, email, password) {
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
        httpOnly: true,
        secure: baseUrl.startsWith('https://'),
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
}

async function login(context, page, email, password) {
  try {
    await loginByUi(page, email, password)
    return 'ui'
  } catch (error) {
    console.warn(`[login] ui failed for ${email}, fallback to api injection: ${String(error)}`)
    await loginByApiInjection(context, page, email, password)
    return 'api'
  }
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
  const answerButton = dialog.locator('button.h-16.w-16.bg-emerald-500').first()
  if ((await answerButton.count()) > 0) {
    await answerButton.click()
    return
  }

  const buttons = dialog.locator('button.h-16.w-16')
  const count = await buttons.count()
  if (count >= 2) {
    await buttons.nth(1).click()
    return
  }

  const dialogText = ((await dialog.textContent()) || '').replace(/\s+/g, ' ').trim()
  throw new Error(`incoming dialog does not have answer button, count=${count}, text="${dialogText.slice(0, 240)}"`)
}

async function hangupFromDialog(page) {
  const dialog = page.locator('[role="dialog"]').filter({
    has: page.locator('button.h-16.w-16'),
  }).first()
  await dialog.waitFor({ state: 'visible', timeout: 15000 })
  const redHangup = dialog.locator('button.h-16.w-16[class*="destructive"]').first()
  if ((await redHangup.count()) > 0) {
    await redHangup.click()
    return
  }
  const fallbackHangup = dialog.locator('button.h-16.w-16').last()
  await fallbackHangup.click()
}

async function readMessageStatus(session, conversationId, messageId) {
  const messages = await fetchMessages(session, conversationId)
  const callMessage = messages.find((m) => String(m?.id || '') === String(messageId))
  return {
    callStatus: String(callMessage?.metadata?.call_status || ''),
    callDuration: Number(callMessage?.metadata?.call_duration || 0),
    metadata: callMessage?.metadata || {},
  }
}

function compactError(error) {
  return String(error).replace(/\s+/g, ' ').trim().slice(0, 400)
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
  let popupLatencyMs = 0
  try {
    await waitIncomingAndAccept(calleePage)
    popupLatencyMs = Date.now() - popupStart
  } catch (error) {
    const [callerState, calleeState, messageStatus] = await Promise.all([
      capturePageState(callerPage, `${callType}-caller-accept-failed`),
      capturePageState(calleePage, `${callType}-callee-accept-failed`),
      readMessageStatus(callerSession, conversationId, callMessageId).catch(() => ({
        callStatus: 'unknown',
        callDuration: 0,
        metadata: {},
      })),
    ])
    throw new Error(
      `accept failed: ${compactError(error)} | messageStatus=${messageStatus.callStatus} duration=${messageStatus.callDuration} metadata=${JSON.stringify(messageStatus.metadata).slice(0, 600)} | callerState=${JSON.stringify(callerState.state)} calleeState=${JSON.stringify(calleeState.state)}`
    )
  }
  console.log(`[call:${callType}] popupLatencyMs=${popupLatencyMs}`)

  const answered = await waitForCallStatus(callerSession, conversationId, callMessageId, ['answered'], 20000)
  console.log(`[call:${callType}] answered`)
  const callerAfterAnswer = await capturePageState(callerPage, `${callType}-caller-after-answer`)
  const calleeAfterAnswer = await capturePageState(calleePage, `${callType}-callee-after-answer`)
  console.log(`[call:${callType}] callerAfterAnswerState=${JSON.stringify(callerAfterAnswer.state)}`)
  console.log(`[call:${callType}] calleeAfterAnswerState=${JSON.stringify(calleeAfterAnswer.state)}`)
  await callerPage.waitForTimeout(Math.max(holdSeconds, 1) * 1000)
  const callerBeforeHangup = await capturePageState(callerPage, `${callType}-caller-before-hangup`)
  console.log(`[call:${callType}] callerBeforeHangupState=${JSON.stringify(callerBeforeHangup.state)}`)
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
  const callerConsole = []
  const calleeConsole = []
  const callerCallFlowLogs = []
  const calleeCallFlowLogs = []
  const caller401s = []
  const callee401s = []
  const callerCallApiTrace = []
  const calleeCallApiTrace = []
  const push401 = (arr, prefix) => async (res) => {
    const status = res.status()
    if (status !== 401 && status !== 405) return
    const url = res.url()
    const entry = `${status} ${url}`
    arr.push(entry)
    if (arr.length > 200) arr.shift()
    console.log(`${prefix}${entry}`)
  }
  const pushCallApiTrace = (arr, prefix) => async (res) => {
    const url = res.url()
    if (!url.includes('/api/messages') && !url.includes('/api/trtc/user-sig') && !url.includes('/api/agora/token')) {
      return
    }
    const method = res.request().method()
    const status = res.status()
    const line = `${status} ${method} ${url}`
    arr.push(line)
    if (arr.length > 300) arr.shift()
    console.log(`${prefix}${line}`)
  }
  const callLogPattern = /(initializeCall|Joined voice channel|Failed to initialize call|TRTC|userSig|WS_ABORT|OPERATION_ABORTED|join channel|Calling\.\.\.)/i
  const pushConsole = (arr, flowArr, prefix) => (msg) => {
    const type = msg.type()
    const text = msg.text()
    if (callLogPattern.test(text)) {
      flowArr.push(`[${type}] ${text}`)
      if (flowArr.length > 300) flowArr.shift()
      console.log(`${prefix}[flow][${type}] ${text}`)
    }
    if (!['error', 'warning', 'warn'].includes(type)) return
    arr.push(`[${type}] ${text}`)
    if (arr.length > 200) arr.shift()
    console.log(`${prefix}[${type}] ${text}`)
  }
  callerPage.on('console', pushConsole(callerConsole, callerCallFlowLogs, '[caller] '))
  calleePage.on('console', pushConsole(calleeConsole, calleeCallFlowLogs, '[callee] '))
  callerPage.on('response', push401(caller401s, '[caller][resp] '))
  calleePage.on('response', push401(callee401s, '[callee][resp] '))
  callerPage.on('response', pushCallApiTrace(callerCallApiTrace, '[caller][api] '))
  calleePage.on('response', pushCallApiTrace(calleeCallApiTrace, '[callee][api] '))

  const report = {
    baseUrl: normalizedBaseUrl,
    callerEmail,
    calleeEmail,
    startedAt: new Date().toISOString(),
    results: [],
  }

  try {
    const callerLoginMode = await login(contextCaller, callerPage, callerEmail, callerPassword)
    const calleeLoginMode = await login(contextCallee, calleePage, calleeEmail, calleePassword)

    const callerUser = await getCurrentUser(contextCaller.request, 'caller')
    const calleeUser = await getCurrentUser(contextCallee.request, 'callee')

    const conversationId = await ensureDirectConversation(contextCaller.request, calleeUser.id)
    report.conversationId = conversationId
    report.callerUserId = callerUser.id
    report.calleeUserId = calleeUser.id
    report.callerLoginMode = callerLoginMode
    report.calleeLoginMode = calleeLoginMode

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
          holdSeconds,
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

    const plannedCases = callCases.length > 0 ? callCases : ['voice', 'video']
    report.plannedCases = plannedCases
    report.holdSeconds = holdSeconds
    report.waitBetweenCasesMs = waitBetweenCasesMs

    for (let i = 0; i < plannedCases.length; i += 1) {
      const callType = plannedCases[i]
      const result = await runCaseSafely(callType)
      report.results.push(result)
      if (i < plannedCases.length - 1 && waitBetweenCasesMs > 0) {
        await callerPage.waitForTimeout(waitBetweenCasesMs)
        await calleePage.waitForTimeout(waitBetweenCasesMs)
      }
    }

    report.finishedAt = new Date().toISOString()
    report.callerConsoleTail = callerConsole.slice(-40)
    report.calleeConsoleTail = calleeConsole.slice(-40)
    report.callerCallFlowLogs = callerCallFlowLogs.slice(-120)
    report.calleeCallFlowLogs = calleeCallFlowLogs.slice(-120)
    report.callerResp401Tail = caller401s.slice(-60)
    report.calleeResp401Tail = callee401s.slice(-60)
    report.callerCallApiTraceTail = callerCallApiTrace.slice(-120)
    report.calleeCallApiTraceTail = calleeCallApiTrace.slice(-120)
    console.log(JSON.stringify(report, null, 2))
    console.log(`[cn_call_e2e_temp] debug screenshots: ${debugDir}`)
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
