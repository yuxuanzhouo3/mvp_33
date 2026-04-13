import { getDatabaseAdapter } from "@/lib/admin/database";
import type {
  AnalysisDashboardSummary,
  AnalysisSourceMetric,
  BehaviorEventType,
  CreateFeedbackClusterData,
  FeedbackAggregation,
  FeedbackCluster,
  FeedbackFilters,
  FeatureChurnMetrics,
  FeatureUsageMetrics,
  User,
  UserBehaviorEvent,
  UserFeedback,
} from "@/lib/admin/types";

const DEFAULT_RANGE_DAYS = 30;
const DEFAULT_FEATURE_LIMIT = 8;
const DEFAULT_CLUSTER_LIMIT = 8;
const DEFAULT_CHURN_WINDOW_DAYS = 7;
const BATCH_SIZE = 200;
const EVENT_BATCH_SIZE = 500;
const MAX_BATCHES = 20;
const DORMANT_DAYS = 30;

const INTERACTION_EVENTS = new Set<BehaviorEventType>(["view", "click", "hover", "scroll", "dwell"]);
const POSITIVE_HINTS = ["好用", "喜欢", "清晰", "顺滑", "稳定", "方便", "值得", "省时间", "useful", "clear", "smooth", "love", "great"];
const NEGATIVE_HINTS = ["卡", "慢", "复杂", "困惑", "难用", "崩", "bug", "问题", "误导", "失败", "slow", "confusing", "broken", "bad"];
const NOISE_PHRASES = new Set([
  "希望",
  "建议",
  "功能",
  "问题",
  "感觉",
  "这个",
  "那个",
  "可以",
  "需要",
  "支持",
  "优化",
  "体验",
  "页面",
  "系统",
  "用户",
  "功能体验",
  "产品功能",
  "product",
  "feature",
  "system",
  "page",
  "user",
  "users",
]);

export interface AnalysisQueryOptions {
  startDate?: string;
  endDate?: string;
  rangeDays?: number;
  featureLimit?: number;
  clusterLimit?: number;
  churnWindowDays?: number;
}

interface ResolvedRange {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
}

interface ClusterSeed {
  topic: string;
  sentiment: "positive" | "negative" | "mixed";
  feedbackId: string;
  version?: string;
  phrase: string;
}

function safeDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIso(date: Date) {
  return date.toISOString();
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toRate(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function round(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function resolveRange(options: AnalysisQueryOptions): ResolvedRange {
  const end = safeDate(options.endDate) || new Date();
  const start =
    safeDate(options.startDate) ||
    addDays(end, -(Number.isFinite(options.rangeDays) ? Math.max(1, Number(options.rangeDays)) : DEFAULT_RANGE_DAYS));

  return {
    start,
    end,
    startIso: toIso(start),
    endIso: toIso(end),
  };
}

function normalizeText(value: string) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingHint(value: string) {
  return value
    .replace(/^(希望|建议|觉得|感觉|可以|需要|please|should|could)\s*/i, "")
    .trim();
}

function normalizeTopic(value: string) {
  const normalized = stripLeadingHint(normalizeText(value))
    .replace(/[~!@#$%^&*()_+\-=[\]{};:'",.<>/?，。！？、；：“”‘’（）【】]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized || normalized.length < 2 || NOISE_PHRASES.has(normalized)) return "";
  return normalized.length > 32 ? normalized.slice(0, 32).trim() : normalized;
}

function titleCaseTopic(value: string) {
  if (!/[a-z]/.test(value)) return value;
  return value
    .split(" ")
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
}

function splitContentToPhrases(content: string) {
  return normalizeText(content)
    .split(/[\n,，。；;!?！？]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function inferSentiment(text: string): "positive" | "negative" | "mixed" {
  const normalized = text.toLowerCase();
  const positive = POSITIVE_HINTS.some((hint) => normalized.includes(hint));
  const negative = NEGATIVE_HINTS.some((hint) => normalized.includes(hint));
  if (positive && negative) return "mixed";
  if (negative) return "negative";
  return positive ? "positive" : "mixed";
}

function extractSeeds(feedback: UserFeedback): ClusterSeed[] {
  const positives = (feedback.pros || []).map((phrase) => ({
    topic: normalizeTopic(phrase),
    phrase,
    sentiment: "positive" as const,
  }));
  const negatives = (feedback.cons || []).map((phrase) => ({
    topic: normalizeTopic(phrase),
    phrase,
    sentiment: "negative" as const,
  }));

  const contentSeeds =
    positives.length || negatives.length
      ? []
      : splitContentToPhrases(feedback.content).map((phrase) => ({
          topic: normalizeTopic(phrase),
          phrase,
          sentiment: inferSentiment(phrase),
        }));

  return [...positives, ...negatives, ...contentSeeds]
    .filter((item) => item.topic)
    .map((item) => ({
      topic: item.topic,
      sentiment: item.sentiment,
      feedbackId: feedback.id,
      version: feedback.version,
      phrase: item.phrase,
    }));
}

function rankTopics(values: string[], limit = 6) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const topic = normalizeTopic(value);
    if (!topic) continue;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic, count]) => ({ topic: titleCaseTopic(topic), count }));
}

function buildSuggestion(topic: string, sentiment: FeedbackCluster["sentiment"]) {
  const label = titleCaseTopic(topic);
  if (sentiment === "negative") {
    return `优先修复「${label}」相关阻力，并补充埋点确认问题来自入口、性能还是文案。`;
  }
  if (sentiment === "positive") {
    return `把「${label}」作为增长亮点，放进新用户引导、版本公告和内容传播里。`;
  }
  return `围绕「${label}」拆分正负反馈，保留高价值体验，同时削减主要阻力。`;
}

function missingAnalysisStorage(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("user_behavior_events") ||
    message.includes("feedback_clusters")
  );
}

async function loadInBatches<T>(
  loader: (offset: number, limit: number) => Promise<T[]>,
  batchSize: number,
) {
  const items: T[] = [];
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const offset = batch * batchSize;
    const chunk = await loader(offset, batchSize);
    if (!chunk.length) break;
    items.push(...chunk);
    if (chunk.length < batchSize) break;
  }
  return items;
}

async function loadUsers() {
  const adapter = getDatabaseAdapter();
  return loadInBatches(
    (offset, limit) => adapter.listUsers({ offset, limit }),
    BATCH_SIZE,
  );
}

async function loadFeedback(range: ResolvedRange) {
  const adapter = getDatabaseAdapter();
  return loadInBatches(
    (offset, limit) =>
      adapter.listFeedback({
        start_date: range.startIso,
        end_date: range.endIso,
        offset,
        limit,
      }),
    BATCH_SIZE,
  );
}

async function loadEvents(range: ResolvedRange, eventType?: BehaviorEventType | BehaviorEventType[], endOverride?: string) {
  const adapter = getDatabaseAdapter();
  try {
    return await loadInBatches(
      (offset, limit) =>
        adapter.listBehaviorEvents({
          start_date: range.startIso,
          end_date: endOverride || range.endIso,
          event_type: eventType,
          offset,
          limit,
        }),
      EVENT_BATCH_SIZE,
    );
  } catch (error) {
    if (missingAnalysisStorage(error)) return [];
    throw error;
  }
}

function buildSourceMetrics(events: UserBehaviorEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const source =
      String(
        event.source ||
          event.properties?.platform ||
          event.properties?.channel ||
          event.properties?.source ||
          "unknown",
      ).trim() || "unknown";
    counts.set(source, (counts.get(source) || 0) + 1);
  }

  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]): AnalysisSourceMetric => ({
      source,
      count,
      share: toRate(count, total),
    }));
}

function buildFeatureUsage(events: UserBehaviorEvent[], activeUsers: number, limit: number) {
  const groups = new Map<
    string,
    {
      usage: number;
      users: Set<string>;
      dwellTotal: number;
      dwellCount: number;
      clickCount: number;
      hoverCount: number;
      scrollCount: number;
      lastUsedAt?: Date;
      pageCounts: Map<string, number>;
    }
  >();

  for (const event of events) {
    if (!INTERACTION_EVENTS.has(event.event_type)) continue;
    const featureKey = String(event.feature_key || "").trim();
    if (!featureKey) continue;

    const entry =
      groups.get(featureKey) ||
      {
        usage: 0,
        users: new Set<string>(),
        dwellTotal: 0,
        dwellCount: 0,
        clickCount: 0,
        hoverCount: 0,
        scrollCount: 0,
        pageCounts: new Map<string, number>(),
      };

    entry.usage += 1;
    if (event.user_id) entry.users.add(event.user_id);
    if (event.event_type === "dwell" && Number.isFinite(event.duration_ms)) {
      entry.dwellTotal += Number(event.duration_ms || 0);
      entry.dwellCount += 1;
    }
    if (event.event_type === "click") entry.clickCount += 1;
    if (event.event_type === "hover") entry.hoverCount += 1;
    if (event.event_type === "scroll") entry.scrollCount += 1;
    if (event.page_path) {
      entry.pageCounts.set(event.page_path, (entry.pageCounts.get(event.page_path) || 0) + 1);
    }
    const eventDate = safeDate(event.occurred_at);
    if (eventDate && (!entry.lastUsedAt || eventDate > entry.lastUsedAt)) {
      entry.lastUsedAt = eventDate;
    }

    groups.set(featureKey, entry);
  }

  return Array.from(groups.entries())
    .map(([feature_key, entry]): FeatureUsageMetrics => ({
      feature_key,
      usage_count: entry.usage,
      unique_users: entry.users.size,
      average_dwell_ms: entry.dwellCount ? round(entry.dwellTotal / entry.dwellCount) : 0,
      user_coverage_rate: toRate(entry.users.size, activeUsers),
      click_count: entry.clickCount,
      hover_count: entry.hoverCount,
      scroll_count: entry.scrollCount,
      last_used_at: entry.lastUsedAt ? entry.lastUsedAt.toISOString() : undefined,
      page_paths: Array.from(entry.pageCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([page]) => page),
    }))
    .sort((a, b) => b.usage_count - a.usage_count || b.unique_users - a.unique_users)
    .slice(0, limit);
}

function buildChurnMetrics(
  interactionEvents: UserBehaviorEvent[],
  loginEvents: UserBehaviorEvent[],
  users: User[],
  churnWindowDays: number,
  limit: number,
) {
  const latestUsage = new Map<string, UserBehaviorEvent>();
  const usersById = new Map(users.map((user) => [user.id, user] as const));
  const loginByUser = new Map<string, Date[]>();

  for (const event of loginEvents) {
    if (!event.user_id) continue;
    const date = safeDate(event.occurred_at);
    if (!date) continue;
    const bucket = loginByUser.get(event.user_id) || [];
    bucket.push(date);
    loginByUser.set(event.user_id, bucket);
  }

  for (const bucket of loginByUser.values()) {
    bucket.sort((a, b) => a.getTime() - b.getTime());
  }

  for (const event of interactionEvents) {
    if (!INTERACTION_EVENTS.has(event.event_type) || !event.user_id || !event.feature_key) continue;
    const existing = latestUsage.get(`${event.feature_key}::${event.user_id}`);
    const eventDate = safeDate(event.occurred_at);
    const existingDate = safeDate(existing?.occurred_at);
    if (!eventDate) continue;
    if (!existing || !existingDate || eventDate > existingDate) {
      latestUsage.set(`${event.feature_key}::${event.user_id}`, event);
    }
  }

  const evaluationCutoff = addDays(new Date(), -churnWindowDays);
  const groups = new Map<
    string,
    {
      users: Set<string>;
      eligible: number;
      churned: number;
      lastFeatureAt?: Date;
    }
  >();

  for (const event of latestUsage.values()) {
    const featureKey = event.feature_key;
    const userId = event.user_id as string;
    const eventDate = safeDate(event.occurred_at);
    if (!eventDate) continue;

    const entry = groups.get(featureKey) || {
      users: new Set<string>(),
      eligible: 0,
      churned: 0,
    };
    entry.users.add(userId);
    if (!entry.lastFeatureAt || eventDate > entry.lastFeatureAt) entry.lastFeatureAt = eventDate;

    if (eventDate <= evaluationCutoff) {
      entry.eligible += 1;
      const deadline = addDays(eventDate, churnWindowDays);
      const loginDates = loginByUser.get(userId) || [];
      let retained = loginDates.some((loginDate) => loginDate > eventDate && loginDate <= deadline);

      if (!retained) {
        const fallbackLastLogin = safeDate(usersById.get(userId)?.last_login_at);
        retained = Boolean(fallbackLastLogin && fallbackLastLogin > eventDate && fallbackLastLogin <= deadline);
      }

      if (!retained) entry.churned += 1;
    }

    groups.set(featureKey, entry);
  }

  return Array.from(groups.entries())
    .map(([feature_key, entry]): FeatureChurnMetrics => ({
      feature_key,
      users: entry.users.size,
      eligible_users: entry.eligible,
      churned_users: entry.churned,
      churn_rate: toRate(entry.churned, entry.eligible),
      churn_window_days: churnWindowDays,
      last_feature_at: entry.lastFeatureAt?.toISOString(),
    }))
    .filter((item) => item.users > 0)
    .sort((a, b) => b.churn_rate - a.churn_rate || b.eligible_users - a.eligible_users)
    .slice(0, limit);
}

function buildFeedbackAggregation(feedbacks: UserFeedback[]): FeedbackAggregation {
  const versionMap = new Map<string, { total: number; pros: number; cons: number; screenshots: number }>();
  const dayMap = new Map<string, { total: number; pros: number; cons: number }>();

  for (const feedback of feedbacks) {
    const version = feedback.version || "未标注版本";
    const dayKey = safeDate(feedback.created_at) ? toDayKey(new Date(feedback.created_at)) : "unknown";
    const versionEntry = versionMap.get(version) || { total: 0, pros: 0, cons: 0, screenshots: 0 };
    const dayEntry = dayMap.get(dayKey) || { total: 0, pros: 0, cons: 0 };

    versionEntry.total += 1;
    versionEntry.pros += feedback.pros?.length || 0;
    versionEntry.cons += feedback.cons?.length || 0;
    versionEntry.screenshots += feedback.screenshot_urls?.length || feedback.images?.length || 0;
    dayEntry.total += 1;
    dayEntry.pros += feedback.pros?.length || 0;
    dayEntry.cons += feedback.cons?.length || 0;

    versionMap.set(version, versionEntry);
    dayMap.set(dayKey, dayEntry);
  }

  return {
    total_feedback: feedbacks.length,
    pending_feedback: feedbacks.filter((item) => item.status === "pending").length,
    analyzed_feedback: feedbacks.filter((item) => item.status === "analyzed").length,
    resolved_feedback: feedbacks.filter((item) => item.status === "resolved").length,
    top_pros: rankTopics(feedbacks.flatMap((item) => item.pros || []), 8),
    top_cons: rankTopics(feedbacks.flatMap((item) => item.cons || []), 8),
    by_version: Array.from(versionMap.entries())
      .map(([version, value]) => ({
        version,
        total: value.total,
        positive_mentions: value.pros,
        negative_mentions: value.cons,
        screenshot_count: value.screenshots,
      }))
      .sort((a, b) => b.total - a.total),
    by_day: Array.from(dayMap.entries())
      .map(([date, value]) => ({
        date,
        total: value.total,
        positive_mentions: value.pros,
        negative_mentions: value.cons,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function buildClusters(feedbacks: UserFeedback[], snapshotKey: string, limit: number): FeedbackCluster[] {
  const groups = new Map<
    string,
    {
      positive: number;
      negative: number;
      mixed: number;
      feedbackIds: Set<string>;
      keywords: Map<string, number>;
      versions: Map<string, number>;
    }
  >();

  for (const feedback of feedbacks) {
    for (const seed of extractSeeds(feedback)) {
      const entry =
        groups.get(seed.topic) ||
        {
          positive: 0,
          negative: 0,
          mixed: 0,
          feedbackIds: new Set<string>(),
          keywords: new Map<string, number>(),
          versions: new Map<string, number>(),
        };

      if (seed.sentiment === "positive") entry.positive += 1;
      else if (seed.sentiment === "negative") entry.negative += 1;
      else entry.mixed += 1;

      entry.feedbackIds.add(seed.feedbackId);
      entry.keywords.set(seed.topic, (entry.keywords.get(seed.topic) || 0) + 1);
      if (seed.version) entry.versions.set(seed.version, (entry.versions.get(seed.version) || 0) + 1);

      const phraseKeywords = normalizeText(seed.phrase)
        .split(/\s+/g)
        .map((item) => normalizeTopic(item))
        .filter(Boolean)
        .slice(0, 4);
      for (const keyword of phraseKeywords) {
        entry.keywords.set(keyword, (entry.keywords.get(keyword) || 0) + 1);
      }

      groups.set(seed.topic, entry);
    }
  }

  const now = new Date().toISOString();

  return Array.from(groups.entries())
    .map(([topic, entry], index) => {
      const positive = entry.positive;
      const negative = entry.negative;
      const mixed = entry.mixed;
      const frequency = positive + negative + mixed;

      let sentiment: FeedbackCluster["sentiment"] = "mixed";
      if (negative > positive && negative >= mixed) sentiment = "negative";
      if (positive > negative && positive >= mixed) sentiment = "positive";

      return {
        id: `${snapshotKey}-${index + 1}`,
        snapshot_key: snapshotKey,
        topic: titleCaseTopic(topic),
        keywords: Array.from(entry.keywords.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([keyword]) => titleCaseTopic(keyword)),
        frequency,
        sentiment,
        suggestion: buildSuggestion(topic, sentiment),
        version: Array.from(entry.versions.entries()).sort((a, b) => b[1] - a[1])[0]?.[0],
        feedback_ids: Array.from(entry.feedbackIds).slice(0, 8),
        created_at: now,
        updated_at: now,
      };
    })
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit);
}

export async function getAnalysisDashboard(options: AnalysisQueryOptions = {}): Promise<AnalysisDashboardSummary> {
  const range = resolveRange(options);
  const [users, feedbacks, allEvents] = await Promise.all([
    loadUsers(),
    loadFeedback(range),
    loadEvents(range),
  ]);

  const extendedEnd = toIso(addDays(range.end, options.churnWindowDays || DEFAULT_CHURN_WINDOW_DAYS));
  const loginEvents = await loadEvents(range, "login", extendedEnd);

  const activeUserIds = new Set<string>();
  for (const event of allEvents) {
    if (event.user_id) activeUserIds.add(event.user_id);
  }
  for (const user of users) {
    const lastLogin = safeDate(user.last_login_at);
    if (lastLogin && lastLogin >= range.start && lastLogin <= range.end) {
      activeUserIds.add(user.id);
    }
  }

  const newUsers = users.filter((user) => {
    const createdAt = safeDate(user.created_at);
    return Boolean(createdAt && createdAt >= range.start && createdAt <= range.end);
  }).length;

  const dormantCutoff = addDays(new Date(), -DORMANT_DAYS);
  const dormantUsers = users.filter((user) => {
    const lastLogin = safeDate(user.last_login_at);
    return !lastLogin || lastLogin < dormantCutoff;
  }).length;

  return {
    generated_at: new Date().toISOString(),
    range_start: range.startIso,
    range_end: range.endIso,
    total_events: allEvents.length,
    active_users: activeUserIds.size,
    new_users: newUsers,
    dormant_users: dormantUsers,
    feedback_count: feedbacks.length,
    register_event_count: allEvents.filter((item) => item.event_type === "register").length,
    login_event_count: allEvents.filter((item) => item.event_type === "login").length,
    logout_event_count: allEvents.filter((item) => item.event_type === "logout").length,
    registration_sources: buildSourceMetrics(allEvents.filter((item) => item.event_type === "register")),
    login_sources: buildSourceMetrics(allEvents.filter((item) => item.event_type === "login")),
    logout_sources: buildSourceMetrics(allEvents.filter((item) => item.event_type === "logout")),
    top_features: buildFeatureUsage(allEvents, activeUserIds.size, options.featureLimit || DEFAULT_FEATURE_LIMIT),
    churn_features: buildChurnMetrics(
      allEvents,
      loginEvents,
      users,
      options.churnWindowDays || DEFAULT_CHURN_WINDOW_DAYS,
      options.featureLimit || DEFAULT_FEATURE_LIMIT,
    ),
    feedback: buildFeedbackAggregation(feedbacks),
    clusters: buildClusters(
      feedbacks,
      `snapshot-${Date.now()}`,
      options.clusterLimit || DEFAULT_CLUSTER_LIMIT,
    ),
  };
}

export async function getFeatureUsageReport(options: AnalysisQueryOptions = {}) {
  const dashboard = await getAnalysisDashboard(options);
  return {
    generated_at: dashboard.generated_at,
    range_start: dashboard.range_start,
    range_end: dashboard.range_end,
    features: dashboard.top_features,
  };
}

export async function getFeatureChurnReport(options: AnalysisQueryOptions = {}) {
  const dashboard = await getAnalysisDashboard(options);
  return {
    generated_at: dashboard.generated_at,
    range_start: dashboard.range_start,
    range_end: dashboard.range_end,
    churn_window_days: options.churnWindowDays || DEFAULT_CHURN_WINDOW_DAYS,
    features: dashboard.churn_features,
  };
}

export async function getFeedbackAggregationReport(options: AnalysisQueryOptions = {}) {
  const range = resolveRange(options);
  const feedbacks = await loadFeedback(range);
  return {
    generated_at: new Date().toISOString(),
    range_start: range.startIso,
    range_end: range.endIso,
    feedback: buildFeedbackAggregation(feedbacks),
  };
}

export async function refreshFeedbackClusters(options: AnalysisQueryOptions = {}) {
  const range = resolveRange(options);
  const adapter = getDatabaseAdapter();
  const feedbacks = await loadFeedback(range);
  const snapshotKey = `feedback-${Date.now()}`;
  const clusters = buildClusters(feedbacks, snapshotKey, options.clusterLimit || DEFAULT_CLUSTER_LIMIT);

  try {
    await Promise.all(
      clusters.map((cluster) =>
        adapter.createFeedbackCluster({
          snapshot_key: snapshotKey,
          topic: cluster.topic,
          keywords: cluster.keywords,
          frequency: cluster.frequency,
          sentiment: cluster.sentiment,
          suggestion: cluster.suggestion,
          version: cluster.version,
          feedback_ids: cluster.feedback_ids,
        } satisfies CreateFeedbackClusterData),
      ),
    );
  } catch (error) {
    if (!missingAnalysisStorage(error)) throw error;
  }

  return {
    snapshot_key: snapshotKey,
    generated_at: new Date().toISOString(),
    range_start: range.startIso,
    range_end: range.endIso,
    clusters,
  };
}

export async function getStoredFeedbackClusters(options: AnalysisQueryOptions & { snapshotKey?: string } = {}) {
  const adapter = getDatabaseAdapter();
  try {
    const rows = await loadInBatches(
      (offset, limit) =>
        adapter.listFeedbackClusters({
          snapshot_key: options.snapshotKey,
          start_date: options.startDate,
          end_date: options.endDate,
          offset,
          limit,
        }),
      BATCH_SIZE,
    );

    if (!rows.length) {
      return refreshFeedbackClusters(options);
    }

    const latestSnapshotKey = options.snapshotKey || rows[0].snapshot_key;
    const clusters = rows.filter((item) => item.snapshot_key === latestSnapshotKey);
    return {
      snapshot_key: latestSnapshotKey,
      generated_at: new Date().toISOString(),
      range_start: options.startDate || "",
      range_end: options.endDate || "",
      clusters: clusters.sort((a, b) => b.frequency - a.frequency),
    };
  } catch (error) {
    if (missingAnalysisStorage(error)) {
      return refreshFeedbackClusters(options);
    }
    throw error;
  }
}
