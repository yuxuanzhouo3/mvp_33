#!/usr/bin/env node

// End-to-end API verification for call-message flow on deployed environments.
// Credentials and hosts are read from environment variables.

function mustGet(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function asJson(text) {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function extractSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
  }
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

class HttpSession {
  constructor(baseUrl, name) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.name = name
    this.cookies = new Map()
  }

  cookieHeader() {
    if (this.cookies.size === 0) return ''
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  storeCookies(headers) {
    for (const line of extractSetCookies(headers)) {
      const pair = line.split(';')[0]
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const key = pair.slice(0, eq).trim()
      const val = pair.slice(eq + 1).trim()
      if (!key) continue
      this.cookies.set(key, val)
    }
  }

  async request(path, options = {}) {
    const method = options.method || 'GET'
    const body = options.json
    const headers = {
      accept: 'application/json',
      ...(options.headers || {}),
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const cookie = this.cookieHeader()
    if (cookie) headers.cookie = cookie

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })

    this.storeCookies(res.headers)
    const text = await res.text()
    const data = asJson(text)
    return { status: res.status, data, headers: res.headers }
  }
}

function printStep(region, step, response, extra = undefined) {
  const suffix = extra ? ` | ${JSON.stringify(extra)}` : ''
  console.log(`[${region}] ${step} -> ${response.status}${suffix}`)
}

function assertStatus(region, step, response, expectedMin = 200, expectedMax = 299) {
  if (response.status < expectedMin || response.status > expectedMax) {
    const err = new Error(
      `[${region}] ${step} failed with status ${response.status}: ${JSON.stringify(response.data)}`
    )
    err.response = response
    throw err
  }
}

async function verifyRegion(region, cfg) {
  const caller = new HttpSession(cfg.baseUrl, `${region}-caller`)
  const callee = new HttpSession(cfg.baseUrl, `${region}-callee`)

  const release = await caller.request('/api/release-check')
  printStep(region, 'release-check', release, release.data)
  assertStatus(region, 'release-check', release)

  const loginCaller = await caller.request('/api/auth/login', {
    method: 'POST',
    json: { email: cfg.callerEmail, password: cfg.callerPassword },
  })
  printStep(region, 'caller-login', loginCaller)
  assertStatus(region, 'caller-login', loginCaller)

  const loginCallee = await callee.request('/api/auth/login', {
    method: 'POST',
    json: { email: cfg.calleeEmail, password: cfg.calleePassword },
  })
  printStep(region, 'callee-login', loginCallee)
  assertStatus(region, 'callee-login', loginCallee)

  const callerUser = loginCaller.data?.user || {}
  const calleeUser = loginCallee.data?.user || {}
  const callerId = String(callerUser.id || '')
  const calleeId = String(calleeUser.id || '')
  if (!callerId || !calleeId) {
    throw new Error(
      `[${region}] Missing user IDs after login: caller=${callerId}, callee=${calleeId}`
    )
  }

  const createConversation = await caller.request('/api/conversations', {
    method: 'POST',
    json: {
      type: 'direct',
      member_ids: [calleeId],
      skip_contact_check: true,
    },
  })
  printStep(region, 'create-conversation', createConversation)
  assertStatus(region, 'create-conversation', createConversation)

  const conversation =
    createConversation.data?.conversation ||
    createConversation.data?.data?.conversation ||
    createConversation.data?.data ||
    {}
  const conversationId = String(conversation.id || conversation._id || '')
  if (!conversationId) {
    throw new Error(`[${region}] Missing conversation id: ${JSON.stringify(createConversation.data)}`)
  }

  const createMessage = await caller.request('/api/messages', {
    method: 'POST',
    json: {
      conversationId,
      content: 'Voice call',
      type: 'system',
      metadata: {
        call_type: 'voice',
        call_status: 'calling',
        channel_name: `verify-${region.toLowerCase()}-${Date.now()}`,
        caller_id: callerId,
        caller_name: callerUser.full_name || callerUser.username || callerUser.email || callerId,
      },
    },
  })
  printStep(region, 'create-call-message', createMessage)
  assertStatus(region, 'create-call-message', createMessage)

  const message = createMessage.data?.message || {}
  const messageId = String(message.id || message._id || '')
  if (!messageId) {
    throw new Error(`[${region}] Missing message id: ${JSON.stringify(createMessage.data)}`)
  }

  const updatedMetadata = {
    ...(message.metadata || {}),
    call_status: 'answered',
    answered_at: new Date().toISOString(),
  }

  const answer = await callee.request(`/api/messages/${encodeURIComponent(messageId)}`, {
    method: 'PUT',
    json: { metadata: updatedMetadata },
  })
  printStep(region, 'callee-answer-put', answer)
  if (answer.status < 200 || answer.status > 299) {
    throw new Error(
      `[${region}] callee-answer-put failed: status=${answer.status}, conversationId=${conversationId}, messageId=${messageId}, body=${JSON.stringify(answer.data)}`
    )
  }

  const messages = await caller.request(`/api/messages?conversationId=${encodeURIComponent(conversationId)}`)
  printStep(region, 'fetch-messages', messages)
  assertStatus(region, 'fetch-messages', messages)

  const list = Array.isArray(messages.data?.messages) ? messages.data.messages : []
  const saved = list.find((m) => String(m.id || m._id) === messageId)
  const finalStatus = saved?.metadata?.call_status
  if (finalStatus !== 'answered') {
    throw new Error(
      `[${region}] final call_status is not answered: messageId=${messageId}, final=${JSON.stringify(
        saved?.metadata || null
      )}`
    )
  }

  return {
    region,
    baseUrl: cfg.baseUrl,
    releaseTag: release.data?.releaseTag || null,
    callerId,
    calleeId,
    conversationId,
    messageId,
    finalCallStatus: finalStatus,
  }
}

async function main() {
  const cn = {
    baseUrl: mustGet('CN_BASE_URL'),
    callerEmail: mustGet('CN_CALLER_EMAIL'),
    callerPassword: mustGet('CN_CALLER_PASSWORD'),
    calleeEmail: mustGet('CN_CALLEE_EMAIL'),
    calleePassword: mustGet('CN_CALLEE_PASSWORD'),
  }

  const intl = {
    baseUrl: mustGet('INTL_BASE_URL'),
    callerEmail: mustGet('INTL_CALLER_EMAIL'),
    callerPassword: mustGet('INTL_CALLER_PASSWORD'),
    calleeEmail: mustGet('INTL_CALLEE_EMAIL'),
    calleePassword: mustGet('INTL_CALLEE_PASSWORD'),
  }

  const results = []
  for (const [region, cfg] of [
    ['CN', cn],
    ['INTL', intl],
  ]) {
    console.log(`\n=== Verifying ${region} (${cfg.baseUrl}) ===`)
    try {
      const result = await verifyRegion(region, cfg)
      results.push({ ok: true, ...result })
      console.log(`[${region}] PASS`)
    } catch (error) {
      results.push({
        ok: false,
        region,
        baseUrl: cfg.baseUrl,
        error: error instanceof Error ? error.message : String(error),
      })
      console.error(`[${region}] FAIL:`, error instanceof Error ? error.message : error)
    }
  }

  console.log('\n=== Summary ===')
  for (const item of results) {
    if (item.ok) {
      console.log(
        `${item.region}: PASS | release=${item.releaseTag} | conversation=${item.conversationId} | message=${item.messageId} | final=${item.finalCallStatus}`
      )
    } else {
      console.log(`${item.region}: FAIL | ${item.error}`)
    }
  }

  const failed = results.filter((r) => !r.ok).length
  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('remote_call_verify crashed:', error)
  process.exit(1)
})
