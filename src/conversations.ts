import { isWorking, needsAttention } from "./activity";
import type { ProjectSectionData } from "./forest";

/**
 * Presentation-only conversation budget for one project.
 *
 * A project's Project Manager conversation is represented by the project
 * heading, not a row, so coordinator threads are transparent while grouping:
 * their direct children are the project's conversations. The budget keeps
 * every conversation that is actually doing something — executing, waiting on
 * the user, selected, or pinned — and previews only a small number of the
 * remaining inactive ones. Nothing here archives, deletes or reorders: it
 * returns the ids a bounded render should show and the ids behind "N more
 * conversations", and the full native tree stays available when expanded.
 */
export const DEFAULT_INACTIVE_CONVERSATIONS = 3;

export interface ConversationPlan {
  /** Members to render for the current reveal state. */
  visible: ReadonlySet<string>;
  /** Members held behind the reveal control (inactive, over the preview). */
  hidden: ReadonlySet<string>;
  /** How many whole conversations the reveal control would add. */
  hiddenConversations: number;
}

export interface ConversationPlanOptions {
  /** Coordinator (Project Manager) threads; transparent for grouping. */
  hiddenGroupIds: ReadonlySet<string>;
  activeThreadId: string | null;
  /** Inactive conversations previewed before the reveal control. */
  limit?: number;
}

/** The topmost non-coordinator ancestor: the conversation this thread belongs to. */
function conversationRootOf(
  section: ProjectSectionData,
  threadId: string,
  hiddenGroupIds: ReadonlySet<string>,
  memberIds: ReadonlySet<string>,
): string {
  let root = threadId;
  let cursor = threadId;
  const guard = memberIds.size + 1;
  for (let step = 0; step < guard; step += 1) {
    const parent = section.forest.parent.get(cursor) ?? null;
    if (parent === null || !memberIds.has(parent)) break;
    if (hiddenGroupIds.has(parent)) {
      // A Project Manager heading stands in for the coordinator row; keep
      // climbing so a worker under it still counts as a top-level conversation.
      cursor = parent;
      continue;
    }
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
    rootOf.set(
      thread.id,
      conversationRootOf(section, thread.id, options.hiddenGroupIds, memberIds),
    );
  }

  // Group visible (non-coordinator) members into conversation families in the
  // section's display order. A family is the root plus every nested descendant.
  const family = new Map<string, string[]>();
  const rootOrder: string[] = [];
  const seenRoot = new Set<string>();
  for (const thread of section.byShelf.active) {
    if (options.hiddenGroupIds.has(thread.id)) continue;
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
