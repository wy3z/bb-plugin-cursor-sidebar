import type { CoreAttentionEntry } from "./status";

/**
 * The subset of one manager attention entry the sidebar consumes. The manager
 * response carries more fields; this is the shape this projection reads, so it
 * is testable without the plugin SDK.
 */
export interface AttentionReadEntry {
  threadId: string | null;
  disposition: string;
  reviewable?: boolean | undefined;
  needsYou?: boolean | undefined;
  live?: "working" | "starting" | "queued" | null | undefined;
  assignmentId?: string | null | undefined;
  executionId?: string | null | undefined;
  hasExactIdentity?: boolean | undefined;
}

export interface AttentionProjection {
  reviewThreadIds: Set<string>;
  failedThreadIds: Set<string>;
  queuedThreadIds: Set<string>;
  entries: CoreAttentionEntry[];
}

/**
 * Project a current exact-generation attention read into the independent
 * review, failure, input and queue facts the sidebar consumes.
 *
 * The manager exposes reviewable, failed and needs-you as separate flags, so a
 * generation that both failed and needs you raises both instead of losing the
 * input fact to an else-if. The recorded assignment/execution identity rides
 * along, so a repeated entry collapses by generation rather than from a loose
 * thread id relabelled as an exact one.
 */
export function projectCurrentAttention(
  attention: readonly AttentionReadEntry[],
  open: readonly AttentionReadEntry[],
): AttentionProjection {
  const reviewThreadIds = new Set<string>();
  const failedThreadIds = new Set<string>();
  const queuedThreadIds = new Set<string>();
  const entries: CoreAttentionEntry[] = [];
  for (const entry of attention) {
    if (entry.threadId === null) continue;
    const identity = {
      assignmentId: entry.assignmentId ?? null,
      executionId: entry.executionId ?? null,
      hasExactIdentity: entry.hasExactIdentity ?? false,
    };
    if (entry.disposition === "for_review" && entry.reviewable === true) {
      reviewThreadIds.add(entry.threadId);
      entries.push({ threadId: entry.threadId, kind: "review", ...identity });
    }
    if (entry.disposition === "failed") {
      failedThreadIds.add(entry.threadId);
      entries.push({ threadId: entry.threadId, kind: "failed", ...identity });
    }
    if (entry.needsYou === true) {
      entries.push({ threadId: entry.threadId, kind: "input", ...identity });
    }
  }
  for (const entry of open) {
    if (entry.threadId !== null && entry.live === "queued") queuedThreadIds.add(entry.threadId);
  }
  return { reviewThreadIds, failedThreadIds, queuedThreadIds, entries };
}
