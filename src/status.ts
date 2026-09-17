/**
 * Status precedence from the native sidebar feed.
 *
 * The main status uses one descending order over separate facts. A status the
 * feed cannot observe is never inferred.
 */
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { isWorking } from "./activity";

export type ThreadStatusKind =
  | "input"
  | "failed"
  | "working"
  | "unread"
  | "idle";

/** Descending precedence; lower rank is stronger. */
export const THREAD_STATUS_RANK: Record<ThreadStatusKind, number> = {
  input: 1,
  failed: 2,
  working: 3,
  unread: 4,
  idle: 5,
};

export const THREAD_STATUS_LABEL: Record<ThreadStatusKind, string> = {
  input: "Needs your input",
  failed: "Failed",
  working: "Working",
  unread: "Unread",
  idle: "Idle",
};

export interface ThreadStatusFacts {
  hasPendingInteraction: boolean;
  indicator: PluginSidebarThread["indicator"];
  failed: boolean;
  isUnread: boolean;
  working: boolean;
}

export function resolveThreadStatus(facts: ThreadStatusFacts): ThreadStatusKind {
  if (facts.hasPendingInteraction) return "input";
  if (facts.failed) return "failed";
  if (facts.working) return "working";
  if (facts.isUnread) return "unread";
  return "idle";
}

export function threadStatusFacts(thread: PluginSidebarThread): ThreadStatusFacts {
  return {
    hasPendingInteraction: thread.hasPendingInteraction,
    indicator: thread.indicator,
    failed: thread.indicator === "unread-error",
    isUnread: thread.isUnread,
    working: isWorking(thread),
  };
}

export interface SectionSummary {
  status: ThreadStatusKind;
  statusLabel: string;
  working: boolean;
}

/**
 * Aggregate a project's status over every member, counting each thread once.
 * An archived member does not raise working or unread.
 */
export function aggregateSectionStatus(
  members: readonly PluginSidebarThread[],
): { status: ThreadStatusKind; pendingInput: number; failures: number; working: boolean } {
  let best: ThreadStatusKind = "idle";
  let pendingInput = 0;
  let failures = 0;
  let working = false;
  for (const thread of members) {
    if (thread.isArchived) continue;
    const facts = threadStatusFacts(thread);
    const status = resolveThreadStatus(facts);
    if (facts.hasPendingInteraction) pendingInput += 1;
    if (facts.failed) failures += 1;
    if (facts.working) working = true;
    if (THREAD_STATUS_RANK[status] < THREAD_STATUS_RANK[best]) best = status;
  }
  return { status: best, pendingInput, failures, working };
}

/**
 * The strongest resolved status across one thread and its rendered subtree.
 */
export function worstThreadStatus(threads: readonly PluginSidebarThread[]): ThreadStatusKind {
  let best: ThreadStatusKind = "idle";
  for (const thread of threads) {
    const status = resolveThreadStatus(threadStatusFacts(thread));
    if (THREAD_STATUS_RANK[status] < THREAD_STATUS_RANK[best]) best = status;
  }
  return best;
}

export function statusDrawsGlyph(status: ThreadStatusKind): boolean {
  return status === "input" || status === "failed" || status === "working";
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

export interface RowStatusView {
  source: "native" | "exact";
  kind: ThreadStatusKind;
  label: string | null;
}

/**
 * Resolve the row's native indicator. `exactStatus` is kept so a caller can
 * still overlay a stronger computed status from a subtree.
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

export function summarizeSection(
  name: string,
  members: readonly PluginSidebarThread[],
): SectionSummary {
  const aggregate = aggregateSectionStatus(members);
  const counts = [
    aggregate.pendingInput > 0 ? `${aggregate.pendingInput} need input` : null,
    aggregate.failures > 0 ? `${aggregate.failures} failed` : null,
  ].filter((part): part is string => part !== null);
  return {
    status: aggregate.status,
    statusLabel: `${name}: ${THREAD_STATUS_LABEL[aggregate.status]}${counts.length > 0 ? ` (${counts.join(", ")})` : ""}`,
    working: aggregate.working,
  };
}
