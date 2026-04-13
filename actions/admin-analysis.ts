"use server";

import { analyzeFeedback } from "@/lib/admin/ai/orchestrator";
import { getAnalysisDashboard as buildAnalysisDashboard, refreshFeedbackClusters as buildFeedbackClusters } from "@/lib/admin/analysis/service";
import { getDatabaseAdapter } from "@/lib/admin/database";
import { requireAdminSession } from "@/lib/admin/session";
import type { AnalysisDashboardSummary, CreateFeedbackData, CreateIterationData, FeedbackCluster, FeedbackStatus, ProductIteration, UserFeedback } from "@/lib/admin/types";

function normalizeFeedbackIds(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return ids.length ? Array.from(new Set(ids)) : undefined;
}

export async function getFeedbacks(): Promise<UserFeedback[]> {
  await requireAdminSession();
  const adapter = getDatabaseAdapter();
  return adapter.listFeedback({ limit: 50 });
}

export async function createFeedbackEntry(data: CreateFeedbackData): Promise<UserFeedback> {
  await requireAdminSession();
  const adapter = getDatabaseAdapter();
  return adapter.createFeedback(data);
}

export async function getAnalysisDashboard(params?: {
  startDate?: string;
  endDate?: string;
  rangeDays?: number;
  featureLimit?: number;
  clusterLimit?: number;
  churnWindowDays?: number;
}): Promise<AnalysisDashboardSummary> {
  await requireAdminSession();
  return buildAnalysisDashboard(params);
}

export async function refreshAnalysisClusters(params?: {
  startDate?: string;
  endDate?: string;
  rangeDays?: number;
  clusterLimit?: number;
}): Promise<{ snapshot_key: string; generated_at: string; range_start: string; range_end: string; clusters: FeedbackCluster[] }> {
  await requireAdminSession();
  return buildFeedbackClusters(params);
}

export async function analyzeAndSaveFeedback(feedbackId: string) {
  await requireAdminSession();
  const adapter = getDatabaseAdapter();
  const feedback = await adapter.getFeedbackById(feedbackId);
  if (!feedback) throw new Error("Feedback not found");

  const analysisResult = await analyzeFeedback(feedback);
  await adapter.updateFeedback(feedbackId, {
    analysis_result: analysisResult,
    status: "analyzed",
  });

  return analysisResult;
}

export async function getIterations(): Promise<ProductIteration[]> {
  await requireAdminSession();
  const adapter = getDatabaseAdapter();
  return adapter.listIterations(20, 0);
}

export async function createIteration(data: Partial<CreateIterationData>) {
  await requireAdminSession();
  const adapter = getDatabaseAdapter();

  const payload: CreateIterationData = {
    version: String(data.version || "").trim(),
    title: String(data.title || "").trim(),
    content: String(data.content || "").trim(),
    status: data.status || "planned",
    release_date: typeof data.release_date === "string" && data.release_date.trim() ? data.release_date : undefined,
    feedback_ids: normalizeFeedbackIds(data.feedback_ids),
  };

  if (!payload.version || !payload.title || !payload.content) {
    throw new Error("Version, title, and content are required");
  }

  return adapter.createIteration(payload);
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  await requireAdminSession();
  const adapter = getDatabaseAdapter();
  return adapter.updateFeedback(id, { status });
}

export async function updateIterationStatus(
  id: string,
  status: ProductIteration["status"],
  options?: { resolveLinkedFeedbacks?: boolean },
) {
  await requireAdminSession();
  const adapter = getDatabaseAdapter();
  const iteration = await adapter.getIterationById(id);

  if (!iteration) {
    throw new Error("Iteration not found");
  }

  const nextReleaseDate =
    status === "completed" && !iteration.release_date
      ? new Date().toISOString()
      : iteration.release_date;

  const updated = await adapter.updateIteration(id, {
    status,
    release_date: nextReleaseDate,
  });

  if (status === "completed" && options?.resolveLinkedFeedbacks && iteration.feedback_ids?.length) {
    await Promise.all(
      iteration.feedback_ids.map((feedbackId) =>
        adapter.updateFeedback(feedbackId, { status: "resolved" }),
      ),
    );
  }

  return updated;
}
