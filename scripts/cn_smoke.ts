import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { NextRequest } from 'next/server'
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { createCloudBaseSession } from '@/lib/cloudbase/auth'
import { PATCH as conversationPatch } from '@/app/api/conversations/[conversationId]/route'
import { PATCH as messagePatch } from '@/app/api/messages/[messageId]/route'
import { POST as paymentCreatePost } from '@/app/api/payment/create/route'
import { POST as paymentConfirmPost } from '@/app/api/payment/confirm/route'
import {
  GET as workspaceAnnouncementsGet,
  POST as workspaceAnnouncementsPost,
  DELETE as workspaceAnnouncementsDelete,
} from '@/app/api/workspace-announcements/route'
import { POST as workspaceJoinRequestPost } from '@/app/api/workspace-join-requests/route'
import { POST as workspaceJoinApprovePost } from '@/app/api/workspace-join-requests/approve/route'
import { POST as workspaceJoinRejectPost } from '@/app/api/workspace-join-requests/reject/route'
import { GET as groupFilesGet } from '@/app/api/groups/[id]/files/route'
import { POST as messagesUploadPost } from '@/app/api/messages/upload/route'
import { POST as userAvatarUploadPost } from '@/app/api/users/profile/upload-avatar/route'
import { POST as groupAvatarUploadPost } from '@/app/api/groups/[id]/upload-avatar/route'

type UserDoc = {
  _id: string
  id: string
  email?: string
  username?: string
  full_name?: string
}

type MemberDoc = {
  _id: string
  workspace_id: string
  user_id: string
  role: string
}

function loadEnv() {
  const root = process.cwd()
  for (const file of ['.env', '.env.cn']) {
    const filePath = path.join(root, file)
    if (fs.existsSync(filePath)) {
      const parsed = dotenv.parse(fs.readFileSync(filePath))
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k]) process.env[k] = v
      }
    }
  }
}

function assertOk(name: string, status: number, body: any) {
  if (status < 200 || status >= 300) {
    throw new Error(`${name} failed: status=${status}, body=${JSON.stringify(body)}`)
  }
}

async function readJson(response: Response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { raw: text }
  }
}

function makeJsonRequest(
  url: string,
  method: string,
  body?: any,
  token?: string,
  extraHeaders?: Record<string, string>
) {
  const headers = new Headers()
  if (body !== undefined) headers.set('content-type', 'application/json')
  if (token) headers.set('cookie', `cb_session=${token}`)
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v)
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeFormRequest(
  url: string,
  formData: FormData,
  token?: string,
  extraHeaders?: Record<string, string>
) {
  const headers = new Headers()
  if (token) headers.set('cookie', `cb_session=${token}`)
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v)
  }
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: formData,
  })
}

async function main() {
  loadEnv()
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase db is not configured')
  }

  const usersRes = await db.collection('users').limit(10).get()
  const users = (usersRes.data || []) as UserDoc[]
  if (users.length < 2) {
    throw new Error('Need at least 2 users in CloudBase users collection')
  }

  const workspaceMembersRes = await db
    .collection('workspace_members')
    .where({
      role: db.command.in(['owner', 'admin']),
    })
    .limit(20)
    .get()

  const adminMemberships = (workspaceMembersRes.data || []) as MemberDoc[]
  if (adminMemberships.length === 0) {
    throw new Error('No owner/admin membership found in workspace_members')
  }

  const adminMembership = adminMemberships[0]
  const adminUser = users.find((u) => u.id === adminMembership.user_id)
  if (!adminUser) {
    throw new Error('Cannot find admin user doc matching workspace_members.user_id')
  }

  const workspaceId = adminMembership.workspace_id
  const adminToken = createCloudBaseSession({
    id: adminUser.id,
    email: adminUser.email || `${adminUser.id}@example.com`,
    username: adminUser.username || adminUser.id,
    full_name: adminUser.full_name || 'Smoke Admin',
    avatar_url: null,
    status: 'online',
    region: 'cn',
    country: 'CN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any)

  const convMemberRes = await db
    .collection('conversation_members')
    .where({
      user_id: adminUser.id,
    })
    .limit(20)
    .get()
  const convMember = (convMemberRes.data || [])[0] as any
  if (!convMember?.conversation_id) {
    throw new Error('No conversation_members record found for admin user')
  }
  const conversationId = convMember.conversation_id as string

  const groupConvRes = await db
    .collection('conversations')
    .where({
      _id: conversationId,
    })
    .limit(1)
    .get()
  const groupConversation =
    (groupConvRes.data || [])[0] ||
    (await db.collection('conversations').where({ type: 'group' }).limit(1).get()).data?.[0]
  if (!groupConversation?._id) {
    throw new Error('No conversation/group available for group APIs')
  }
  const groupId = groupConversation._id as string

  const tempMsgRes = await db.collection('messages').add({
    conversation_id: conversationId,
    sender_id: adminUser.id,
    content: `smoke-message-${Date.now()}`,
    type: 'text',
    metadata: null,
    reactions: [],
    is_edited: false,
    is_deleted: false,
    is_recalled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    region: 'cn',
  })
  const messageId = (tempMsgRes.id || tempMsgRes._id) as string

  const logs: Array<{ name: string; status: number; ok: boolean; body: any }> = []
  async function run(name: string, fn: () => Promise<Response>) {
    const resp = await fn()
    const body = await readJson(resp as any)
    const ok = resp.status >= 200 && resp.status < 300
    logs.push({ name, status: resp.status, ok, body })
    return { resp, body }
  }

  // 1) conversations actions
  for (const action of ['read', 'pin', 'unpin', 'hide', 'unhide', 'delete', 'restore']) {
    await run(`conversation:${action}`, async () =>
      conversationPatch(
        makeJsonRequest(
          `http://localhost/api/conversations/${conversationId}`,
          'PATCH',
          { action },
          adminToken
        ),
        { params: Promise.resolve({ conversationId }) }
      )
    )
  }

  // 2) message hide/unhide/recall
  for (const action of ['hide', 'unhide', 'recall']) {
    await run(`message:${action}`, async () =>
      messagePatch(
        makeJsonRequest(
          `http://localhost/api/messages/${messageId}`,
          'PATCH',
          { action },
          adminToken
        ),
        { params: Promise.resolve({ messageId }) }
      )
    )
  }

  // 3) payment create/confirm
  const paymentCreate = await run('payment:create', async () =>
    paymentCreatePost(
      makeJsonRequest(
        'http://localhost/api/payment/create',
        'POST',
        {
          amount: 1,
          currency: 'CNY',
          payment_method: 'wechat',
          region: 'cn',
          description: 'smoke test',
        },
        adminToken
      )
    )
  )
  const orderNo = paymentCreate.body?.data?.order_no
  if (orderNo) {
    await run('payment:confirm', async () =>
      paymentConfirmPost(
        makeJsonRequest(
          'http://localhost/api/payment/confirm',
          'POST',
          {
            order_no: orderNo,
            payment_status: 'failed',
          },
          adminToken
        )
      )
    )
  }

  // 4) workspace announcements
  const announcementCreate = await run('workspace-announcements:post', async () =>
    workspaceAnnouncementsPost(
      makeJsonRequest(
        'http://localhost/api/workspace-announcements',
        'POST',
        {
          workspaceId,
          title: `Smoke ${Date.now()}`,
          content: 'Smoke announcement content',
        },
        adminToken
      )
    )
  )

  await run('workspace-announcements:get', async () =>
    workspaceAnnouncementsGet(
      makeJsonRequest(
        `http://localhost/api/workspace-announcements?workspaceId=${workspaceId}`,
        'GET',
        undefined,
        adminToken
      )
    )
  )

  const announcementId = announcementCreate.body?.announcement?.id
  if (announcementId) {
    await run('workspace-announcements:delete', async () =>
      workspaceAnnouncementsDelete(
        makeJsonRequest(
          'http://localhost/api/workspace-announcements',
          'DELETE',
          { announcementId },
          adminToken
        )
      )
    )
  }

  // 5) workspace join requests (post + approve + reject)
  const applicantA = users.find((u) => u.id !== adminUser.id) || users[0]
  const applicantB = users.find((u) => u.id !== adminUser.id && u.id !== applicantA.id) || users[0]

  const createJoinReq = async (userId: string, reason: string) =>
    workspaceJoinRequestPost(
      makeJsonRequest(
        'http://localhost/api/workspace-join-requests',
        'POST',
        { workspaceId, reason },
        undefined,
        { 'x-user-id': userId }
      )
    )

  await run('workspace-join-requests:post-a', async () => createJoinReq(applicantA.id, 'smoke approve'))
  await run('workspace-join-requests:post-b', async () => createJoinReq(applicantB.id, 'smoke reject'))

  const pendingReqRes = await db
    .collection('workspace_join_requests')
    .where({
      workspace_id: workspaceId,
      status: 'pending',
      user_id: db.command.in([applicantA.id, applicantB.id]),
    })
    .get()

  const pending = pendingReqRes.data || []
  const pendingA = pending.find((r: any) => r.user_id === applicantA.id)
  const pendingB = pending.find((r: any) => r.user_id === applicantB.id)

  if (pendingA?._id) {
    await run('workspace-join-requests:approve', async () =>
      workspaceJoinApprovePost(
        makeJsonRequest(
          'http://localhost/api/workspace-join-requests/approve',
          'POST',
          { requestId: pendingA._id, workspaceId },
          adminToken
        )
      )
    )
  }

  if (pendingB?._id) {
    await run('workspace-join-requests:reject', async () =>
      workspaceJoinRejectPost(
        makeJsonRequest(
          'http://localhost/api/workspace-join-requests/reject',
          'POST',
          { requestId: pendingB._id, workspaceId },
          adminToken
        )
      )
    )
  }

  // 6) group files GET
  await run('groups-files:get', async () =>
    groupFilesGet(
      makeJsonRequest(
        `http://localhost/api/groups/${groupId}/files`,
        'GET',
        undefined,
        adminToken
      ),
      { params: Promise.resolve({ id: groupId }) }
    )
  )

  // 7) messages upload
  {
    const fd = new FormData()
    const textFile = new File([Buffer.from('smoke-upload')], 'smoke.txt', {
      type: 'text/plain',
    })
    fd.append('file', textFile)
    fd.append('conversationId', conversationId)

    await run('messages-upload:post', async () =>
      messagesUploadPost(makeFormRequest('http://localhost/api/messages/upload', fd, adminToken))
    )
  }

  // 8) user avatar upload (1x1 png)
  {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Yx4kAAAAASUVORK5CYII=',
      'base64'
    )
    const fd = new FormData()
    const imgFile = new File([png], 'avatar-smoke.png', { type: 'image/png' })
    fd.append('file', imgFile)
    await run('users-avatar-upload:post', async () =>
      userAvatarUploadPost(makeFormRequest('http://localhost/api/users/profile/upload-avatar', fd, adminToken))
    )
  }

  // 9) group avatar upload (1x1 png)
  {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Yx4kAAAAASUVORK5CYII=',
      'base64'
    )
    const fd = new FormData()
    const imgFile = new File([png], 'group-avatar-smoke.png', { type: 'image/png' })
    fd.append('file', imgFile)
    await run('groups-avatar-upload:post', async () =>
      groupAvatarUploadPost(
        makeFormRequest(`http://localhost/api/groups/${groupId}/upload-avatar`, fd, adminToken),
        { params: Promise.resolve({ id: groupId }) }
      )
    )
  }

  // report
  let failed = 0
  console.log('\nCN Smoke Test Results:')
  for (const item of logs) {
    if (!item.ok) failed += 1
    console.log(
      `${item.ok ? 'PASS' : 'FAIL'} | ${item.name} | status=${item.status} | body=${JSON.stringify(item.body)}`
    )
  }
  console.log(`\nSummary: total=${logs.length}, failed=${failed}`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('CN smoke test crashed:', error)
  process.exit(1)
})

