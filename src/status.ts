/**
 * Status precedence and Core aggregation.
 *
 * The main status uses one descending order over separate facts. A status that
 * the feed cannot observe is never inferred: queued needs admitted pending work
 * and unavailable needs a failed or stale observation, so neither is produced
 * from an idle row. Review needs a current, exact Assignment generation; idle
 * alone is never review. Counts are independent, so a thread that both needs
 * input and has a current failure raises both numbers.
 */
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { isWorking } from "./activity";
import type { ExecutionObservation } from "./core-ownership";

export type ThreadStatusKind =
  | "input"
  | "failed"
  | "review"
  | "working"
  | "queued"
  | "unavailable"
  | "unread"
  | "idle";

/** Descending precedence; lower rank is stronger. */
export const THREAD_STATUS_RANK: Record<ThreadStatusKind, number> = {
  input: 1,
  failed: 2,
  review: 3,
  working: 4,
  queued: 5,
  unavailable: 6,
  unread: 7,
  idle: 8,
};

export const THREAD_STATUS_LABEL: Record<ThreadStatusKind, string> = {
  input: "Needs your input",
  failed: "Failed",
  review: "For Core review",
  working: "Working",
  queued: "Queued",
  unavailable: "Status unavailable",
  unread: "Unread",
  idle: "Idle",
};

export interface ThreadStatusFacts {
  hasPendingInteraction: boolean;
  indicator: PluginSidebarThread["indicator"];
  /**
   * A current exact-generation failure. Native `unread-error` is folded in by
   * `threadStatusFacts`; a stale or unknown authority read leaves only the
   * native feed fact, never invents a current one.
   */
  failed: boolean;
  /** An assigned Worker's exact, current generation awaits review. */
  workerReviewRequired: boolean;
  /** Admitted pending work for the thread, from an exact generation. */
  queued: boolean;
  /** A necessary read failed or is stale, so absence is not proof. */
  unavailable: boolean;
  isUnread: boolean;
  working: boolean;
}

export function resolveThreadStatus(facts: ThreadStatusFacts): ThreadStatusKind {
  if (facts.hasPendingInteraction) return "input";
  if (facts.failed) return "failed";
  if (facts.workerReviewRequired) return "review";
  if (facts.working) return "working";
  if (facts.queued) return "queued";
  if (facts.unavailable) return "unavailable";
  if (facts.isUnread) return "unread";
  return "idle";
}

export function threadStatusFacts(
  thread: PluginSidebarThread,
  reviewRequired: boolean,
  extra?: {
    queued?: boolean;
    unavailable?: boolean;
    failed?: boolean;
    /** The merged native + current-authority input fact for this thread. */
    hasPendingInteraction?: boolean;
  },
): ThreadStatusFacts {
  return {
    hasPendingInteraction: extra?.hasPendingInteraction ?? thread.hasPendingInteraction,
    indicator: thread.indicator,
    // The caller passes `failed` only from the current exact generation. The
    // native feed failure is a separate honest fact, so it is folded in whether
    // or not the caller passes an exact boolean. An explicit `false` means "not
    // in the exact set", never "no failure", and must not hide `unread-error`.
    failed: thread.indicator === "unread-error" || (extra?.failed ?? false),
    workerReviewRequired: reviewRequired,
    queued: extra?.queued ?? false,
    unavailable: extra?.unavailable ?? false,
    isUnread: thread.isUnread,
    working: isWorking(thread),
  };
}

export interface CoreStatusSummary {
  status: ThreadStatusKind;
  pendingInput: number;
  failures: number;
  review: number;
  working: boolean;
  unread: number;
  queued: number;
  unavailable: boolean;
  /**
   * Unresolved attention (input, failure or review) whose thread the sidebar
   * does not render as a row: an archived member, or a thread the manager's
   * bounded attention list names but the native feed does not carry. These are
   * the reveal targets for the Core heading.
   */
  archivedAttention: number;
  /** True when the manager's bounded attention list was truncated. */
  attentionHasMore: boolean;
}

/** One exact actionable identity from the manager's bounded attention list. */
export type CoreAttentionKind = "input" | "review" | "failed";

export interface CoreAttentionEntry {
  threadId: string;
  kind: CoreAttentionKind;
  /**
   * The recorded assignment generation, when the manager persisted one. Kept so
   * a repeated identity is recognized as one generation instead of relabelled
   * from a loose `threadId` + `kind`. Null on legacy rows.
   */
  assignmentId?: string | null;
  executionId?: string | null;
  /** False when the manager recorded no exact generation for this entry. */
  hasExactIdentity?: boolean;
}

/**
 * The identity a duplicate attention entry shares. A recorded exact generation
 * collapses by its assignment/execution identity; a legacy row collapses by its
 * thread id. The `kind` is appended by the caller so two independent facts on
 * one generation (input and failure) both count.
 */
function attentionIdentity(entry: CoreAttentionEntry): string {
  const exact =
    entry.hasExactIdentity !== false &&
    (entry.assignmentId != null || entry.executionId != null);
  return exact
    ? `gen:${entry.assignmentId ?? ""}:${entry.executionId ?? ""}`
    : `row:${entry.threadId}`;
}

/**
 * The manager's authoritative unresolved attention for one Core. `entries` is
 * the bounded actionable list (exact generation identities); `counts` is the
 * durable census over every generation, retained so a truncated list still
 * reports the true totals instead of zero. An empty list is never read as proof
 * that nothing is unresolved when the read failed: a failed read omits the
 * authority entirely.
 */
export interface CoreAttentionAuthority {
  entries: readonly CoreAttentionEntry[];
  counts: { forReview: number; failed: number; needsYou: number };
  hasMore: boolean;
}

/**
 * Exact-generation facts for one Core's owned members. `reviewThreadIds`,
 * `failedThreadIds` and `queuedThreadIds` must only be populated from a current
 * observation; a stale or unknown read clears them so nothing is presented as
 * current. `observation` drives the Core's own unavailable flag. `attention`
 * carries the manager's exact actionable identities, including threads the
 * sidebar feed does not carry, so a missing feed entry is never counted as
 * zero.
 */
export interface CoreExactFacts {
  observation: ExecutionObservation;
  reviewThreadIds: ReadonlySet<string>;
  failedThreadIds: ReadonlySet<string>;
  queuedThreadIds: ReadonlySet<string>;
  attention?: CoreAttentionAuthority | undefined;
}

export const EMPTY_CORE_EXACT_FACTS: CoreExactFacts = {
  observation: "unknown",
  reviewThreadIds: new Set(),
  failedThreadIds: new Set(),
  queuedThreadIds: new Set(),
};

/**
 * The threads a current authority read names as needing input. Merged with the
 * native pending flag per thread so the two sources raise one input fact.
 */
function attentionInputIds(exact: CoreExactFacts): ReadonlySet<string> {
  const ids = new Set<string>();
  if (exact.observation === "current-read" && exact.attention) {
    for (const entry of exact.attention.entries) {
      if (entry.kind === "input") ids.add(entry.threadId);
    }
  }
  return ids;
}

/**
 * Aggregate a Core's own status over every owned member, counting each thread
 * once. An archived member still contributes unresolved attention (input,
 * failure, review) so a filtered or collapsed home never hides it, but it does
 * not raise working or unread. References never reach this function.
 */
export function aggregateCoreStatus(
  members: readonly PluginSidebarThread[],
  exact: CoreExactFacts,
): CoreStatusSummary {
  const exactCurrent = exact.observation === "current-read";
  const unavailable = !exactCurrent;
  // An unreadable Core read is its own status, not idle. A real feed fact
  // (input, work, native failure) still outranks it below.
  let best: ThreadStatusKind = unavailable ? "unavailable" : "idle";
  let pendingInput = 0;
  let failures = 0;
  let review = 0;
  let working = false;
  let unread = 0;
  let queued = 0;
  const feedIds = new Set(members.map((thread) => thread.id));
  // The manager's exact actionable list is authoritative for input facts too.
  // A feed row's native pending flag and the manager's current needs-you entry
  // describe the same thread, so merge them per thread: the row raises input
  // once whether one source reports it or both. Failed and review facts already
  // merge for feed rows through the exact sets above.
  const authorityInputIds = attentionInputIds(exact);
  let archivedAttention = 0;
  for (const thread of members) {
    const needsInput = thread.hasPendingInteraction || authorityInputIds.has(thread.id);
    const failed =
      thread.indicator === "unread-error" ||
      (exactCurrent && exact.failedThreadIds.has(thread.id));
    const reviewable = exactCurrent && exact.reviewThreadIds.has(thread.id);
    const admitted = exactCurrent && exact.queuedThreadIds.has(thread.id);
    const busy = isWorking(thread);
    const attention = needsInput || failed || reviewable;
    if (thread.isArchived && !attention) continue;
    if (needsInput) pendingInput += 1;
    if (failed) failures += 1;
    if (reviewable) review += 1;
    // A row the sidebar never draws (archived) still needs a reveal target.
    if (thread.isArchived && attention) archivedAttention += 1;
    if (!thread.isArchived) {
      if (busy) working = true;
      if (thread.isUnread) unread += 1;
      if (admitted) queued += 1;
    }
    const status = resolveThreadStatus(
      threadStatusFacts(thread, reviewable, {
        queued: admitted,
        unavailable,
        failed,
        hasPendingInteraction: needsInput,
      }),
    );
    if (THREAD_STATUS_RANK[status] < THREAD_STATUS_RANK[best]) best = status;
  }
  let attentionHasMore = false;
  if (exactCurrent && exact.attention) {
    attentionHasMore = exact.attention.hasMore;
    // Threads the feed does not carry: archived workers and generations whose
    // native thread is absent. Count each exact identity once per category. A
    // feed row's authority facts are merged in the loop above, so it is never
    // re-counted here; skip-as-dedup is not a fact policy.
    const seen = new Set<string>();
    const seenReveal = new Set<string>();
    for (const entry of exact.attention.entries) {
      if (feedIds.has(entry.threadId)) continue;
      const identity = attentionIdentity(entry);
      const key = `${identity}\u0000${entry.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!seenReveal.has(identity)) {
        seenReveal.add(identity);
        archivedAttention += 1;
      }
      if (entry.kind === "input") {
        pendingInput += 1;
        if (THREAD_STATUS_RANK.input < THREAD_STATUS_RANK[best]) best = "input";
      } else if (entry.kind === "failed") {
        failures += 1;
        if (THREAD_STATUS_RANK.failed < THREAD_STATUS_RANK[best]) best = "failed";
      } else {
        review += 1;
        if (THREAD_STATUS_RANK.review < THREAD_STATUS_RANK[best]) best = "review";
      }
    }
    // The bounded list is truncated: the census is the authority, so lift each
    // category to its true total rather than reporting only what fit.
    if (attentionHasMore) {
      review = Math.max(review, exact.attention.counts.forReview);
      failures = Math.max(failures, exact.attention.counts.failed);
      pendingInput = Math.max(pendingInput, exact.attention.counts.needsYou);
      if (exact.attention.counts.needsYou > 0 && THREAD_STATUS_RANK.input < THREAD_STATUS_RANK[best]) best = "input";
      if (exact.attention.counts.failed > 0 && THREAD_STATUS_RANK.failed < THREAD_STATUS_RANK[best]) best = "failed";
      if (exact.attention.counts.forReview > 0 && THREAD_STATUS_RANK.review < THREAD_STATUS_RANK[best]) best = "review";
    }
  }
  return {
    status: best,
    pendingInput,
    failures,
    review,
    working,
    unread,
    queued,
    unavailable,
    archivedAttention,
    attentionHasMore,
  };
}

/**
 * The strongest resolved status across one thread and its rendered subtree,
 * from the same typed facts the Core heading aggregates. Exported so a row can
 * show a current exact failure/review/queue even when the native indicator is
 * silent, instead of falling back to the read dot.
 */
export function worstThreadStatus(
  threads: readonly PluginSidebarThread[],
  exact: CoreExactFacts,
): ThreadStatusKind {
  const exactCurrent = exact.observation === "current-read";
  // The row merges the same current authority input the heading counts, so a
  // present row the manager names as needing input resolves input even when its
  // native pending flag is silent.
  const authorityInputIds = attentionInputIds(exact);
  let best: ThreadStatusKind = exactCurrent ? "idle" : "unavailable";
  for (const thread of threads) {
    const status = resolveThreadStatus(
      threadStatusFacts(thread, exactCurrent && exact.reviewThreadIds.has(thread.id), {
        queued: exactCurrent && exact.queuedThreadIds.has(thread.id),
        unavailable: !exactCurrent,
        failed: exactCurrent ? exact.failedThreadIds.has(thread.id) : undefined,
        hasPendingInteraction: thread.hasPendingInteraction || authorityInputIds.has(thread.id),
      }),
    );
    if (THREAD_STATUS_RANK[status] < THREAD_STATUS_RANK[best]) best = status;
  }
  return best;
}

/**
 * Whether a resolved status is a positive exact fact strong enough to draw over
 * a silent native row. `unavailable` is a Core-heading observation, not a
 * per-row fact, so it never overrides a row's own read state.
 */
export function statusDrawsGlyph(status: ThreadStatusKind): boolean {
  return (
    status === "input" ||
    status === "failed" ||
    status === "review" ||
    status === "working" ||
    status === "queued"
  );
}

/**
 * The status category a native indicator speaks for under the one shared
 * precedence. Every live-activity indicator is `working`; an error is a
 * failure, a raised hand is input and a success notification is unread. `none`
 * carries no status of its own; the caller supplies the read/unread fallback
 * from the native `isUnread` flag.
 */
export function nativeStatusKind(
  indicator: PluginSidebarThread["indicator"],
): ThreadStatusKind {
  switch (indicator) {
    case "waiting-for-input":
      return "input";
    case "unread-error":
      return "failed";
    case "unread-success":
      return "unread";
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
    case "draft":
    case "working-draft":
      return "working";
    default:
      return "idle";
  }
}

/**
 * The one status a row renders. `source` says which glyph vocabulary draws it:
 * the native indicator keeps its richer glyph and label when it wins or ties,
 * and the exact status draws its own glyph and label only when it is strictly
 * stronger. `label` is null when the native slot supplies its own read/unread
 * label, and the resolved label when the exact status wins.
 */
export interface RowStatusView {
  source: "native" | "exact";
  kind: ThreadStatusKind;
  label: string | null;
}

/**
 * Resolve the exact status against the native indicator with the same
 * precedence the Core heading uses. This is the row consumer's only status
 * decision: a stronger exact failure or review is never hidden behind a weaker
 * native glyph, and the accessible label always matches the glyph drawn.
 */
export function resolveRowStatus(args: {
  indicator: PluginSidebarThread["indicator"];
  indicatorLabel: string | null;
  isUnread: boolean;
  hasGlyph: boolean;
  exactStatus: ThreadStatusKind | undefined;
}): RowStatusView {
  const nativeKind = args.hasGlyph
    ? nativeStatusKind(args.indicator)
    : args.isUnread
      ? "unread"
      : "idle";
  const exact = args.exactStatus;
  if (
    exact !== undefined &&
    statusDrawsGlyph(exact) &&
    THREAD_STATUS_RANK[exact] < THREAD_STATUS_RANK[nativeKind]
  ) {
    return { source: "exact", kind: exact, label: THREAD_STATUS_LABEL[exact] };
  }
  return { source: "native", kind: nativeKind, label: args.indicatorLabel };
}

/** The section heading's status prop, derived from the same aggregate. */
export interface CoreSectionSummary {
  status: ThreadStatusKind;
  statusLabel: string;
  counts: readonly string[];
  revealAttention: number;
  attentionHasMore: boolean;
}

/**
 * The status, accessible label, count text and reveal count one section heading
 * renders. Extracted so the exact prop the heading receives is exercised
 * directly, not re-derived in a fixture.
 */
export function summarizeSection(
  name: string,
  members: readonly PluginSidebarThread[],
  exact: CoreExactFacts,
): CoreSectionSummary {
  const aggregate = aggregateCoreStatus(members, exact);
  const counts = [
    aggregate.pendingInput > 0 ? `${aggregate.pendingInput} need input` : null,
    aggregate.failures > 0 ? `${aggregate.failures} failed` : null,
    aggregate.review > 0 ? `${aggregate.review} for review` : null,
    aggregate.queued > 0 ? `${aggregate.queued} queued` : null,
  ].filter((part): part is string => part !== null);
  return {
    status: aggregate.status,
    statusLabel: `${name}: ${THREAD_STATUS_LABEL[aggregate.status]}${counts.length > 0 ? ` (${counts.join(", ")})` : ""}`,
    counts,
    revealAttention: aggregate.archivedAttention,
    attentionHasMore: aggregate.attentionHasMore,
  };
}
