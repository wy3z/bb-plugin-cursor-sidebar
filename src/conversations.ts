import { isWorking, needsAttention } from "./activity";
import type { DisplayRow, ProjectSectionData } from "./forest";

/**
 * Presentation-only conversation budget for one project.
 *
 * The budget keeps every conversation that is actually doing something —
 * executing, waiting on the user, selected, or pinned — and previews a page
 * of the remaining inactive ones in the section's display order. Each "Show
 * more" reveals another page. Sidebar filters and extra grouping (env/date/
 * status) do not apply inside a project. Nothing here archives, deletes or
 * reorders: it returns the ids a bounded render should show and the ids behind
 * "N more conversations", and the full native tree stays available when
 * expanded.
 */
export const CONVERSATION_PAGE_SIZE = 10;
export const DEFAULT_INACTIVE_CONVERSATIONS = CONVERSATION_PAGE_SIZE;

export interface ConversationPlan {
  /** Members to render for the current reveal state. */
  visible: ReadonlySet<string>;
  /** Members held behind the reveal control (inactive, over the preview). */
  hidden: ReadonlySet<string>;
  /** How many whole conversations the reveal control would add. */
  hiddenConversations: number;
}

export interface ConversationPlanOptions {
  activeThreadId: string | null;
  /** Inactive conversations previewed before the reveal control. */
  limit?: number;
}

/** The topmost ancestor: the conversation this thread belongs to. */
function conversationRootOf(
  section: ProjectSectionData,
  threadId: string,
  memberIds: ReadonlySet<string>,
): string {
  let root = threadId;
  let cursor = threadId;
  const guard = memberIds.size + 1;
  for (let step = 0; step < guard; step += 1) {
    const parent = section.forest.parent.get(cursor) ?? null;
    if (parent === null || !memberIds.has(parent)) break;
    root = parent;
    cursor = parent;
  }
  return root;
}

/**
 * Partition a project's active members into the bounded preview and the
 * remainder behind "N more conversations". Order follows the section's own
 * display order, so a stored user order is respected and no live re-sort is
 * introduced.
 */
export function planConversations(
  section: ProjectSectionData,
  options: ConversationPlanOptions,
): ConversationPlan {
  const limit = options.limit ?? DEFAULT_INACTIVE_CONVERSATIONS;
  const memberIds = new Set(section.members.map((thread) => thread.id));
  const byId = new Map(section.members.map((thread) => [thread.id, thread]));

  const rootOf = new Map<string, string>();
  for (const thread of section.members) {
    rootOf.set(thread.id, conversationRootOf(section, thread.id, memberIds));
  }

  // Group visible members into conversation families in the section's display
  // order. A family is the root plus every nested descendant.
  const family = new Map<string, string[]>();
  const rootOrder: string[] = [];
  const seenRoot = new Set<string>();
  for (const thread of section.byShelf.active) {
    const root = rootOf.get(thread.id) ?? thread.id;
    const members = family.get(root);
    if (members) members.push(thread.id);
    else family.set(root, [thread.id]);
    if (!seenRoot.has(root)) {
      seenRoot.add(root);
      rootOrder.push(root);
    }
  }

  const familyIsActive = (root: string): boolean =>
    (family.get(root) ?? []).some((id) => {
      const thread = byId.get(id);
      return (
        thread !== undefined &&
        (isWorking(thread) ||
          needsAttention(thread) ||
          thread.isPinned ||
          id === options.activeThreadId)
      );
    });

  const visible = new Set<string>();
  const hidden = new Set<string>();
  const inactiveRoots: string[] = [];
  for (const root of rootOrder) {
    if (familyIsActive(root)) {
      for (const id of family.get(root) ?? []) visible.add(id);
    } else {
      inactiveRoots.push(root);
    }
  }

  const preview = inactiveRoots.slice(0, Math.max(0, limit));
  for (const root of preview) {
    for (const id of family.get(root) ?? []) visible.add(id);
  }
  const remainder = inactiveRoots.slice(preview.length);
  for (const root of remainder) {
    for (const id of family.get(root) ?? []) hidden.add(id);
  }

  return { visible, hidden, hiddenConversations: remainder.length };
}

/**
 * Page one grouped bucket (Today, a status, an environment): the caller's
 * display order, then a hard page limit. Families keep the selected
 * conversation order — manual reorder included — instead of being forced back
 * to recency, so a drag inside a bucket survives. The open chat is not
 * injected on top, so toggling a heading cannot make a bonus row appear.
 */
export function pageGroupRows(
  rows: readonly DisplayRow[],
  parentOf: (threadId: string) => string | null,
  options: ConversationPlanOptions,
): { shown: DisplayRow[]; hiddenConversations: number } {
  if (rows.length === 0) return { shown: [], hiddenConversations: 0 };
  const limit = options.limit ?? DEFAULT_INACTIVE_CONVERSATIONS;
  const ids = new Set(rows.map((row) => row.thread.id));
  const rootOf = (threadId: string): string => {
    let cursor = threadId;
    const guard = ids.size + 1;
    for (let step = 0; step < guard; step += 1) {
      const parent = parentOf(cursor);
      if (parent === null || !ids.has(parent)) return cursor;
      cursor = parent;
    }
    return cursor;
  };
  const family = new Map<string, DisplayRow[]>();
  const rootOrder: string[] = [];
  for (const row of rows) {
    const root = rootOf(row.thread.id);
    const members = family.get(root);
    if (members) members.push(row);
    else {
      family.set(root, [row]);
      rootOrder.push(root);
    }
  }
  const keepRoots = new Set(rootOrder.slice(0, Math.max(0, limit)));
  const shown: DisplayRow[] = [];
  for (const root of rootOrder) {
    if (!keepRoots.has(root)) continue;
    shown.push(...(family.get(root) ?? []));
  }
  return {
    shown,
    hiddenConversations: Math.max(0, rootOrder.length - keepRoots.size),
  };
}
