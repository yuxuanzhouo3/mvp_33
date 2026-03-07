import { getDatabase } from "@/lib/database/cloudbase-service"
import { resolveDeploymentRegion } from "@/lib/config/deployment-region"
import { getSupabaseAdminForDownloads } from "@/lib/downloads/supabase-admin"

type DeploymentRegion = "CN" | "INTL"

const CN_USERS_COLLECTION = "users"
const CN_MESSAGES_COLLECTION = "messages"

const MIN_DAYS = 14
const MAX_DAYS = 120
const DEFAULT_DAYS = 30

const FIRST_USE_LATENCY_BUCKETS = [
  { key: "under_1h", label: "< 1小时", minHours: 0, maxHours: 1 },
  { key: "under_24h", label: "1-24小时", minHours: 1, maxHours: 24 },
  { key: "under_3d", label: "1-3天", minHours: 24, maxHours: 72 },
  { key: "under_7d", label: "3-7天", minHours: 72, maxHours: 168 },
  { key: "over_7d", label: "> 7天", minHours: 168, maxHours: Number.POSITIVE_INFINITY },
] as const

const TOOL_NAME_MAP: Record<string, string> = {
  "email-multi-sender": "邮件群发",
  "text-multi-sender": "短信群发",
  "social-auto-poster": "社媒自动发帖",
  "data-scraper": "数据抓取",
  "jpeg-to-pdf": "图片转 PDF",
  "file-format-converter": "文件格式转换",
  "video-to-gif": "视频转 GIF",
  "bulk-image-resizer": "批量图片缩放",
  "qr-generator": "二维码生成",
  "currency-converter": "汇率换算",
  "unit-converter": "单位换算",
  "text-utilities": "文本工具",
  "timezone-converter": "时区换算",
  "file-compressor": "文件压缩",
  "file-decompressor": "文件解压",
  "file-encryptor": "文件加密",
  "file-decryptor": "文件解密",
  "cloud-drive": "云盘",
  unknown: "未知工具",
}

interface AnalyticsUser {
  userId: string
  createdAt: Date
}

interface UsageEvent {
  userId: string
  createdAt: Date
  toolId: string
}

export interface MarketAnalyticsOverview {
  totalUsers: number
  newUsersInRange: number
  activeUsersInRange: number
  activeUsers7d: number
  activeUsers30d: number
  activeRate7d: number
  activeRate30d: number
  firstUseRate7dForNewUsers30d: number
  avgUsageEventsPerActiveUser30d: number
  medianFirstUseHours: number
  totalUsageEventsInRange: number
}

export interface MarketAnalyticsTrendPoint {
  date: string
  newUsers: number
  dau: number
  wau: number
  usageEvents: number
  firstUseUsers: number
}

export interface MarketAnalyticsCohortPoint {
  cohortDate: string
  newUsers: number
  d1Users: number
  d3Users: number
  d7Users: number
  d14Users: number
  d30Users: number
  d1Rate: number
  d3Rate: number
  d7Rate: number
  d14Rate: number
  d30Rate: number
}

export interface MarketAnalyticsRetentionSummary {
  cohortUsers: number
  d1Rate: number
  d3Rate: number
  d7Rate: number
  d14Rate: number
  d30Rate: number
}

export interface MarketAnalyticsHabitBucket {
  label: string
  events: number
  activeUsers: number
  share: number
}

export interface MarketAnalyticsToolHabit {
  toolId: string
  toolName: string
  events: number
  activeUsers: number
  share: number
}

export interface MarketAnalyticsFirstUseTool {
  toolId: string
  toolName: string
  users: number
  share: number
}

export interface MarketAnalyticsFirstUseLatency {
  bucket: string
  label: string
  users: number
  share: number
}

export interface MarketAnalyticsSegment {
  label: string
  users: number
  share: number
}

export interface MarketAnalyticsData {
  region: DeploymentRegion
  generatedAt: string
  rangeDays: number
  overview: MarketAnalyticsOverview
  retention: {
    summary: MarketAnalyticsRetentionSummary
    cohorts: MarketAnalyticsCohortPoint[]
  }
  trends: MarketAnalyticsTrendPoint[]
  habits: {
    byWeekday: MarketAnalyticsHabitBucket[]
    byHour: MarketAnalyticsHabitBucket[]
    topTools: MarketAnalyticsToolHabit[]
  }
  firstUse: {
    topTools: MarketAnalyticsFirstUseTool[]
    latencyDistribution: MarketAnalyticsFirstUseLatency[]
  }
  segmentation: {
    recency: MarketAnalyticsSegment[]
    frequency30d: MarketAnalyticsSegment[]
  }
}

function toRate(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0
  return Number(((numerator / denominator) * 100).toFixed(2))
}

function toSafeNumber(value: any) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDays(days?: number | string) {
  const parsed = Number(days)
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(parsed)))
}

function normalizeUserId(value: any) {
  const raw = String(value || "").trim()
  if (!raw) return null
  return raw.slice(0, 128)
}

function parseDate(value: any) {
  if (!value) return null
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) return null
  return date
}

function utcStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function buildDateKeys(days: number) {
  const safeDays = parseDays(days)
  const end = utcStart(new Date())
  const keys: string[] = []
  for (let index = safeDays - 1; index >= 0; index -= 1) {
    keys.push(toDateKey(addUtcDays(end, -index)))
  }
  return keys
}

function getHourDiff(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60)
}

function getDayDiff(start: Date, end: Date) {
  const a = utcStart(start).getTime()
  const b = utcStart(end).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
  }
  return Number(sorted[mid].toFixed(2))
}

function extractToolIdFromMessage(messageType?: string | null) {
  const normalized = String(messageType || "").trim().toLowerCase()
  if (!normalized) return "chat"
  if (normalized === "text") return "chat"
  return `chat-${normalized}`
}

function resolveToolName(toolId: string) {
  return TOOL_NAME_MAP[toolId] || toolId
}

function missingCloudbaseCollection(error: any) {
  const message = String(error?.message || "")
  const code = String(error?.code || "")
  return (
    message.includes("Db or Table not exist") ||
    message.includes("DATABASE_COLLECTION_NOT_EXIST") ||
    code.includes("DATABASE_COLLECTION_NOT_EXIST")
  )
}

async function safeCloudbaseCollectionGet(db: any, collection: string) {
  try {
    const result = await db.collection(collection).get()
    return Array.isArray(result?.data) ? result.data : []
  } catch (error: any) {
    if (missingCloudbaseCollection(error)) return []
    throw error
  }
}

async function loadIntlUsersAndEvents() {
  const supabase = getSupabaseAdminForDownloads()

  const [usersResult, messageResult] = await Promise.all([
    supabase.from("users").select("id,created_at"),
    supabase
      .from("messages")
      .select("sender_id,type,created_at")
      .eq("is_deleted", false),
  ])

  if (usersResult.error) throw new Error(usersResult.error.message)
  if (messageResult.error) throw new Error(messageResult.error.message)

  const users: AnalyticsUser[] = []
  for (const row of usersResult.data || []) {
    const userId = normalizeUserId((row as any)?.id)
    const createdAt = parseDate((row as any)?.created_at)
    if (!userId || !createdAt) continue
    users.push({ userId, createdAt })
  }

  const usageEvents: UsageEvent[] = []
  for (const row of messageResult.data || []) {
    const userId = normalizeUserId((row as any)?.sender_id)
    const createdAt = parseDate((row as any)?.created_at)
    if (!userId || !createdAt) continue
    usageEvents.push({
      userId,
      createdAt,
      toolId: extractToolIdFromMessage((row as any)?.type),
    })
  }

  return { users, usageEvents }
}

async function loadCnUsersAndEvents() {
  const db = await getDatabase()
  const [usersRows, messageRows] = await Promise.all([
    safeCloudbaseCollectionGet(db, CN_USERS_COLLECTION),
    safeCloudbaseCollectionGet(db, CN_MESSAGES_COLLECTION),
  ])

  const users: AnalyticsUser[] = []
  for (const row of usersRows) {
    const userId = normalizeUserId((row as any)?.id || (row as any)?._id)
    const createdAt = parseDate((row as any)?.created_at || (row as any)?.createdAt)
    if (!userId || !createdAt) continue
    users.push({ userId, createdAt })
  }

  const usageEvents: UsageEvent[] = []
  for (const row of messageRows) {
    if ((row as any)?.is_deleted) continue
    const userId = normalizeUserId((row as any)?.sender_id)
    const createdAt = parseDate((row as any)?.created_at || (row as any)?.createdAt)
    if (!userId || !createdAt) continue
    usageEvents.push({
      userId,
      createdAt,
      toolId: extractToolIdFromMessage((row as any)?.type || (row as any)?.message_type),
    })
  }

  return { users, usageEvents }
}

function buildMarketAnalyticsData(params: {
  region: DeploymentRegion
  days: number
  users: AnalyticsUser[]
  usageEvents: UsageEvent[]
}): MarketAnalyticsData {
  const days = parseDays(params.days)
  const now = new Date()
  const today = utcStart(now)
  const dateKeys = buildDateKeys(days)
  const dateKeySet = new Set(dateKeys)

  const last7Start = addUtcDays(today, -6)
  const last30Start = addUtcDays(today, -29)
  const cohortWindowStart = addUtcDays(today, -Math.min(29, days - 1))

  const userCreatedAtMap = new Map<string, Date>()
  for (const user of params.users) {
    if (!userCreatedAtMap.has(user.userId)) {
      userCreatedAtMap.set(user.userId, user.createdAt)
    }
  }

  const usageEvents = params.usageEvents.filter((event) => userCreatedAtMap.has(event.userId))

  const activityDaysByUser = new Map<string, Set<string>>()
  const dauUsersByDate = new Map<string, Set<string>>()
  const usageEventsByDate = new Map<string, number>()
  const totalUsesByUser = new Map<string, number>()
  const lastUseByUser = new Map<string, Date>()
  const firstUseByUser = new Map<string, Date>()
  const firstToolByUser = new Map<string, string>()

  const weekdayEvents = Array.from({ length: 7 }, () => 0)
  const weekdayUsers: Array<Set<string>> = Array.from({ length: 7 }, () => new Set<string>())
  const hourEvents = Array.from({ length: 24 }, () => 0)
  const hourUsers: Array<Set<string>> = Array.from({ length: 24 }, () => new Set<string>())
  const topToolMap = new Map<string, { events: number; users: Set<string> }>()

  for (const event of usageEvents) {
    const userId = event.userId
    const date = event.createdAt
    const dateKey = toDateKey(date)

    const userActiveDays = activityDaysByUser.get(userId) || new Set<string>()
    userActiveDays.add(dateKey)
    activityDaysByUser.set(userId, userActiveDays)

    const dauUsers = dauUsersByDate.get(dateKey) || new Set<string>()
    dauUsers.add(userId)
    dauUsersByDate.set(dateKey, dauUsers)

    usageEventsByDate.set(dateKey, toSafeNumber(usageEventsByDate.get(dateKey)) + 1)
    totalUsesByUser.set(userId, toSafeNumber(totalUsesByUser.get(userId)) + 1)

    const currentLastUse = lastUseByUser.get(userId)
    if (!currentLastUse || currentLastUse.getTime() < date.getTime()) {
      lastUseByUser.set(userId, date)
    }

    const currentFirstUse = firstUseByUser.get(userId)
    if (!currentFirstUse || currentFirstUse.getTime() > date.getTime()) {
      firstUseByUser.set(userId, date)
      firstToolByUser.set(userId, event.toolId || "unknown")
    }

    const weekday = date.getUTCDay()
    weekdayEvents[weekday] += 1
    weekdayUsers[weekday].add(userId)

    const hour = date.getUTCHours()
    hourEvents[hour] += 1
    hourUsers[hour].add(userId)

    const toolId = event.toolId || "unknown"
    const currentTool = topToolMap.get(toolId) || { events: 0, users: new Set<string>() }
    currentTool.events += 1
    currentTool.users.add(userId)
    topToolMap.set(toolId, currentTool)
  }

  const newUsersByDate = new Map<string, number>()
  for (const createdAt of userCreatedAtMap.values()) {
    const key = toDateKey(createdAt)
    if (dateKeySet.has(key)) {
      newUsersByDate.set(key, toSafeNumber(newUsersByDate.get(key)) + 1)
    }
  }

  const firstUseUsersByDate = new Map<string, number>()
  for (const firstUseAt of firstUseByUser.values()) {
    const key = toDateKey(firstUseAt)
    if (dateKeySet.has(key)) {
      firstUseUsersByDate.set(key, toSafeNumber(firstUseUsersByDate.get(key)) + 1)
    }
  }

  const wauByDate = new Map<string, number>()
  for (let index = 0; index < dateKeys.length; index += 1) {
    const windowUsers = new Set<string>()
    const from = Math.max(0, index - 6)
    for (let day = from; day <= index; day += 1) {
      const users = dauUsersByDate.get(dateKeys[day])
      if (!users) continue
      for (const userId of users.values()) {
        windowUsers.add(userId)
      }
    }
    wauByDate.set(dateKeys[index], windowUsers.size)
  }

  const trends: MarketAnalyticsTrendPoint[] = dateKeys.map((key) => ({
    date: key,
    newUsers: toSafeNumber(newUsersByDate.get(key)),
    dau: (dauUsersByDate.get(key) || new Set<string>()).size,
    wau: toSafeNumber(wauByDate.get(key)),
    usageEvents: toSafeNumber(usageEventsByDate.get(key)),
    firstUseUsers: toSafeNumber(firstUseUsersByDate.get(key)),
  }))

  const activeUsers7d = new Set<string>()
  const activeUsers30d = new Set<string>()
  const activeUsersInRange = new Set<string>()
  let usageEvents30d = 0
  let totalUsageEventsInRange = 0
  const usageCount30dByUser = new Map<string, number>()

  for (const event of usageEvents) {
    const day = utcStart(event.createdAt)
    if (day.getTime() >= last7Start.getTime()) {
      activeUsers7d.add(event.userId)
    }
    if (day.getTime() >= last30Start.getTime()) {
      activeUsers30d.add(event.userId)
      usageEvents30d += 1
      usageCount30dByUser.set(event.userId, toSafeNumber(usageCount30dByUser.get(event.userId)) + 1)
    }

    const key = toDateKey(day)
    if (dateKeySet.has(key)) {
      activeUsersInRange.add(event.userId)
      totalUsageEventsInRange += 1
    }
  }

  let newUsers30d = 0
  let firstUseWithin7dForNewUsers30d = 0
  for (const [userId, createdAt] of userCreatedAtMap.entries()) {
    if (utcStart(createdAt).getTime() < last30Start.getTime()) continue
    newUsers30d += 1
    const firstUseAt = firstUseByUser.get(userId)
    if (!firstUseAt) continue
    const hoursToFirstUse = getHourDiff(createdAt, firstUseAt)
    if (hoursToFirstUse >= 0 && hoursToFirstUse <= 24 * 7) {
      firstUseWithin7dForNewUsers30d += 1
    }
  }

  const firstUseDurationsHours: number[] = []
  for (const [userId, firstUseAt] of firstUseByUser.entries()) {
    const createdAt = userCreatedAtMap.get(userId)
    if (!createdAt) continue
    const hours = getHourDiff(createdAt, firstUseAt)
    if (!Number.isFinite(hours) || hours < 0) continue
    firstUseDurationsHours.push(hours)
  }

  const overview: MarketAnalyticsOverview = {
    totalUsers: userCreatedAtMap.size,
    newUsersInRange: trends.reduce((sum, row) => sum + row.newUsers, 0),
    activeUsersInRange: activeUsersInRange.size,
    activeUsers7d: activeUsers7d.size,
    activeUsers30d: activeUsers30d.size,
    activeRate7d: toRate(activeUsers7d.size, userCreatedAtMap.size),
    activeRate30d: toRate(activeUsers30d.size, userCreatedAtMap.size),
    firstUseRate7dForNewUsers30d: toRate(firstUseWithin7dForNewUsers30d, newUsers30d),
    avgUsageEventsPerActiveUser30d:
      activeUsers30d.size > 0 ? Number((usageEvents30d / activeUsers30d.size).toFixed(2)) : 0,
    medianFirstUseHours: median(firstUseDurationsHours),
    totalUsageEventsInRange,
  }

  const cohortMap = new Map<
    string,
    {
      newUsers: number
      d1Users: number
      d3Users: number
      d7Users: number
      d14Users: number
      d30Users: number
    }
  >()

  const ensureCohort = (cohortDate: string) => {
    const existing = cohortMap.get(cohortDate)
    if (existing) return existing
    const next = { newUsers: 0, d1Users: 0, d3Users: 0, d7Users: 0, d14Users: 0, d30Users: 0 }
    cohortMap.set(cohortDate, next)
    return next
  }

  for (const [userId, createdAt] of userCreatedAtMap.entries()) {
    const cohortStartDay = utcStart(createdAt)
    if (cohortStartDay.getTime() < cohortWindowStart.getTime()) continue
    if (cohortStartDay.getTime() > today.getTime()) continue

    const cohortDateKey = toDateKey(cohortStartDay)
    const cohort = ensureCohort(cohortDateKey)
    cohort.newUsers += 1

    const activityDays = activityDaysByUser.get(userId) || new Set<string>()
    if (activityDays.has(toDateKey(addUtcDays(cohortStartDay, 1)))) cohort.d1Users += 1
    if (activityDays.has(toDateKey(addUtcDays(cohortStartDay, 3)))) cohort.d3Users += 1
    if (activityDays.has(toDateKey(addUtcDays(cohortStartDay, 7)))) cohort.d7Users += 1
    if (activityDays.has(toDateKey(addUtcDays(cohortStartDay, 14)))) cohort.d14Users += 1
    if (activityDays.has(toDateKey(addUtcDays(cohortStartDay, 30)))) cohort.d30Users += 1
  }

  const cohorts = Array.from(cohortMap.entries())
    .map(([cohortDate, value]) => ({
      cohortDate,
      newUsers: value.newUsers,
      d1Users: value.d1Users,
      d3Users: value.d3Users,
      d7Users: value.d7Users,
      d14Users: value.d14Users,
      d30Users: value.d30Users,
      d1Rate: toRate(value.d1Users, value.newUsers),
      d3Rate: toRate(value.d3Users, value.newUsers),
      d7Rate: toRate(value.d7Users, value.newUsers),
      d14Rate: toRate(value.d14Users, value.newUsers),
      d30Rate: toRate(value.d30Users, value.newUsers),
    }))
    .sort((a, b) => (a.cohortDate < b.cohortDate ? 1 : -1))

  const retentionTotals = cohorts.reduce(
    (acc, row) => {
      acc.newUsers += row.newUsers
      acc.d1Users += row.d1Users
      acc.d3Users += row.d3Users
      acc.d7Users += row.d7Users
      acc.d14Users += row.d14Users
      acc.d30Users += row.d30Users
      return acc
    },
    { newUsers: 0, d1Users: 0, d3Users: 0, d7Users: 0, d14Users: 0, d30Users: 0 },
  )

  const retentionSummary: MarketAnalyticsRetentionSummary = {
    cohortUsers: retentionTotals.newUsers,
    d1Rate: toRate(retentionTotals.d1Users, retentionTotals.newUsers),
    d3Rate: toRate(retentionTotals.d3Users, retentionTotals.newUsers),
    d7Rate: toRate(retentionTotals.d7Users, retentionTotals.newUsers),
    d14Rate: toRate(retentionTotals.d14Users, retentionTotals.newUsers),
    d30Rate: toRate(retentionTotals.d30Users, retentionTotals.newUsers),
  }

  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
  const weekdayLabel: Record<number, string> = {
    0: "周日",
    1: "周一",
    2: "周二",
    3: "周三",
    4: "周四",
    5: "周五",
    6: "周六",
  }

  const byWeekday: MarketAnalyticsHabitBucket[] = weekdayOrder.map((weekday) => ({
    label: weekdayLabel[weekday],
    events: weekdayEvents[weekday],
    activeUsers: weekdayUsers[weekday].size,
    share: toRate(weekdayEvents[weekday], usageEvents.length),
  }))

  const byHour: MarketAnalyticsHabitBucket[] = hourEvents.map((events, hour) => ({
    label: `${String(hour).padStart(2, "0")}:00`,
    events,
    activeUsers: hourUsers[hour].size,
    share: toRate(events, usageEvents.length),
  }))

  const topTools: MarketAnalyticsToolHabit[] = Array.from(topToolMap.entries())
    .map(([toolId, item]) => ({
      toolId,
      toolName: resolveToolName(toolId),
      events: item.events,
      activeUsers: item.users.size,
      share: toRate(item.events, usageEvents.length),
    }))
    .sort((a, b) => (b.events === a.events ? b.activeUsers - a.activeUsers : b.events - a.events))
    .slice(0, 12)

  const firstToolCountMap = new Map<string, number>()
  for (const toolId of firstToolByUser.values()) {
    firstToolCountMap.set(toolId, toSafeNumber(firstToolCountMap.get(toolId)) + 1)
  }

  const totalFirstUseUsers = firstToolByUser.size
  const firstUseTopTools: MarketAnalyticsFirstUseTool[] = Array.from(firstToolCountMap.entries())
    .map(([toolId, users]) => ({
      toolId,
      toolName: resolveToolName(toolId),
      users,
      share: toRate(users, totalFirstUseUsers),
    }))
    .sort((a, b) => b.users - a.users)
    .slice(0, 10)

  const latencyCount = new Map<string, number>()
  for (const item of FIRST_USE_LATENCY_BUCKETS) {
    latencyCount.set(item.key, 0)
  }

  for (const [userId, firstUseAt] of firstUseByUser.entries()) {
    const createdAt = userCreatedAtMap.get(userId)
    if (!createdAt) continue
    const hours = getHourDiff(createdAt, firstUseAt)
    if (!Number.isFinite(hours) || hours < 0) continue

    const bucket = FIRST_USE_LATENCY_BUCKETS.find((item) => hours >= item.minHours && hours < item.maxHours)
    if (!bucket) continue
    latencyCount.set(bucket.key, toSafeNumber(latencyCount.get(bucket.key)) + 1)
  }

  const latencyDistribution: MarketAnalyticsFirstUseLatency[] = FIRST_USE_LATENCY_BUCKETS.map((bucket) => {
    const users = toSafeNumber(latencyCount.get(bucket.key))
    return {
      bucket: bucket.key,
      label: bucket.label,
      users,
      share: toRate(users, totalFirstUseUsers),
    }
  })

  const recencySegments = [
    { key: "active", label: "高活跃（7天内）", users: 0 },
    { key: "at_risk", label: "待召回（8-30天）", users: 0 },
    { key: "dormant", label: "沉默（30天以上）", users: 0 },
    { key: "never_used", label: "未激活（从未使用）", users: 0 },
  ]

  const frequencySegments = [
    { key: "zero", label: "0次", users: 0 },
    { key: "once", label: "1次", users: 0 },
    { key: "two_three", label: "2-3次", users: 0 },
    { key: "four_seven", label: "4-7次", users: 0 },
    { key: "eight_plus", label: "8次及以上", users: 0 },
  ]

  for (const [userId] of userCreatedAtMap.entries()) {
    const lastUse = lastUseByUser.get(userId)
    if (!lastUse) {
      recencySegments[3].users += 1
    } else {
      const daysSinceLastUse = getDayDiff(lastUse, today)
      if (daysSinceLastUse <= 7) recencySegments[0].users += 1
      else if (daysSinceLastUse <= 30) recencySegments[1].users += 1
      else recencySegments[2].users += 1
    }

    const frequency30d = toSafeNumber(usageCount30dByUser.get(userId))
    if (frequency30d <= 0) frequencySegments[0].users += 1
    else if (frequency30d === 1) frequencySegments[1].users += 1
    else if (frequency30d <= 3) frequencySegments[2].users += 1
    else if (frequency30d <= 7) frequencySegments[3].users += 1
    else frequencySegments[4].users += 1
  }

  const recency = recencySegments.map((item) => ({
    label: item.label,
    users: item.users,
    share: toRate(item.users, userCreatedAtMap.size),
  }))

  const frequency30d = frequencySegments.map((item) => ({
    label: item.label,
    users: item.users,
    share: toRate(item.users, userCreatedAtMap.size),
  }))

  return {
    region: params.region,
    generatedAt: new Date().toISOString(),
    rangeDays: days,
    overview,
    retention: {
      summary: retentionSummary,
      cohorts,
    },
    trends,
    habits: {
      byWeekday,
      byHour,
      topTools,
    },
    firstUse: {
      topTools: firstUseTopTools,
      latencyDistribution,
    },
    segmentation: {
      recency,
      frequency30d,
    },
  }
}

export async function getMarketAdminAnalytics(input?: { days?: number | string }): Promise<MarketAnalyticsData> {
  const days = parseDays(input?.days)
  const region: DeploymentRegion = resolveDeploymentRegion() === "INTL" ? "INTL" : "CN"

  if (region === "INTL") {
    const data = await loadIntlUsersAndEvents()
    return buildMarketAnalyticsData({ region, days, users: data.users, usageEvents: data.usageEvents })
  }

  const data = await loadCnUsersAndEvents()
  return buildMarketAnalyticsData({ region, days, users: data.users, usageEvents: data.usageEvents })
}
