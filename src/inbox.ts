/**
 * Pure helpers over the host's sidebar thread view: titles, hierarchy, and
 * status aggregation. No React here.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */
import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";

interface DisplayThread extends PluginSidebarThread {
  displayTitle?: string;
}

export function threadDisplayTitle(thread: DisplayThread): string {
  return thread.displayTitle ?? threadEditableTitle(thread);
}

export function threadEditableTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim();
  if (title) return title;
  const fallback = thread.titleFallback?.trim();
  return fallback ? fallback : "Untitled thread";
}

/**
 * Resolve presentation before filtering, so mentions can name other projects.
 * Keep persisted titles intact for rename, and expand only one level to avoid
 * cycles between threads whose initial prompts mention one another.
 */
export function resolveThreadDisplayTitles(
  threads: readonly PluginSidebarThread[],
): DisplayThread[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  return threads.map((thread) => ({
    ...thread,
    displayTitle: threadEditableTitle(thread).replace(
      /@thread:(thr_[a-zA-Z0-9_-]+)/g,
      (token, id: string) => {
        const referenced = byId.get(id);
        return referenced ? `@${threadEditableTitle(referenced)}` : token;
      },
    ),
  }));
}

/** Archived threads never belong in the sidebar. */
export function visibleInboxThreads(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  return threads.filter((thread) => !thread.isArchived);
}

/** The children of one thread, oldest first (the order they were spawned). */
export function childrenOf(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
): PluginSidebarThread[] {
  return threads
    .filter((thread) => thread.parentThreadId === parentThreadId)
    .sort(
      (left, right) =>
        left.createdAt - right.createdAt || left.id.localeCompare(right.id),
    );
}

/** Every descendant of one thread, depth-first, cycle-safe. */
export function descendantsOf(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
): PluginSidebarThread[] {
  const result: PluginSidebarThread[] = [];
  const seen = new Set<string>([parentThreadId]);
  const visit = (id: string) => {
    for (const child of childrenOf(threads, id)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push(child);
      visit(child.id);
    }
  };
  visit(parentThreadId);
  return result;
}

const INDICATOR_PRECEDENCE: readonly PluginSidebarThreadIndicator[] = [
  "unread-error",
  "waiting-for-input",
  "working-draft",
  "workflow",
  "background-agent",
  "background-command",
  "plan-mode",
  "goal",
  "runtime",
  "draft",
  "unread-success",
  "none",
];

const indicatorRank = new Map(
  INDICATOR_PRECEDENCE.map((indicator, index) => [indicator, index]),
);

/**
 * The thread whose indicator the whole group should show: the strongest
 * status held by the parent or any descendant, so a blocked child raises the
 * parent's row instead of hiding behind it.
 */
export function statusSourceForGroup(
  parent: PluginSidebarThread,
  descendants: readonly PluginSidebarThread[],
): PluginSidebarThread {
  let best = parent;
  let bestRank = indicatorRank.get(parent.indicator) ?? Number.MAX_SAFE_INTEGER;
  for (const thread of descendants) {
    const rank = indicatorRank.get(thread.indicator) ?? Number.MAX_SAFE_INTEGER;
    if (rank < bestRank) {
      best = thread;
      bestRank = rank;
    }
  }
  return best;
}
