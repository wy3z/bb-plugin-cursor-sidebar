import type { DisplayRow } from "./forest";

/**
 * Standalone grouping: pinned families, named native folders, then recency.
 *
 * One family (a root plus its descendants) appears in exactly one place.
 * Precedence is pinned, then folder, then date, so pinning or filing a chat
 * never duplicates it under its date group. Assignment is a family property
 * read from the family root: the root's native pin state and the root's
 * native section id. Children follow their root even when native state
 * diverges per thread (only settable from BB's own surfaces).
 *
 * Folders are BB's native thread sections. A section id no native section
 * names (deleted elsewhere, or never listed) files nothing: those families
 * fall through to their date group. Managed projects never consult this
 * module; their native sections are ignored here.
 */

export interface StandaloneFolderGroup {
  sectionId: string;
  rows: DisplayRow[];
  memberIds: ReadonlySet<string>;
}

export interface StandalonePartition {
  pinned: DisplayRow[];
  pinnedIds: ReadonlySet<string>;
  folders: StandaloneFolderGroup[];
  /** Member thread id to its native folder id. */
  folderOf: ReadonlyMap<string, string>;
  dated: DisplayRow[];
}

export interface StandaloneRowFacts {
  parentOf: (threadId: string) => string | null;
  sectionIdOf: (threadId: string) => string | null;
  isPinned: (threadId: string) => boolean;
  knownFolderIds: ReadonlySet<string>;
}

const EMPTY: StandalonePartition = {
  pinned: [],
  pinnedIds: new Set(),
  folders: [],
  folderOf: new Map(),
  dated: [],
};

/** The topmost ancestor of one thread, cycle-safe. */
export function familyRootId(
  parentOf: (threadId: string) => string | null,
  threadId: string,
): string {
  let root = threadId;
  let cursor = parentOf(threadId);
  const seen = new Set<string>([threadId]);
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    root = cursor;
    cursor = parentOf(cursor);
  }
  return root;
}

/** Every id in one display family: the root plus its in-shelf descendants. */
export function familyIds(
  parentOf: (threadId: string) => string | null,
  childrenOf: (threadId: string) => readonly string[],
  threadId: string,
): string[] {
  const root = familyRootId(parentOf, threadId);
  const ids = [root];
  const seen = new Set<string>([root]);
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenOf(current)) {
      if (seen.has(child)) continue;
      seen.add(child);
      ids.push(child);
      stack.push(child);
    }
  }
  return ids;
}

/**
 * Split flattened standalone rows into pinned, folder and dated clusters.
 * Input row order is preserved inside every cluster, so the caller's stored
 * sibling order survives; folder clusters follow first appearance.
 */
export function partitionStandaloneRows(
  rows: readonly DisplayRow[],
  facts: StandaloneRowFacts,
): StandalonePartition {
  if (rows.length === 0) return EMPTY;
  const rootOf = new Map<string, string>();
  for (const row of rows) {
    if (!rootOf.has(row.thread.id)) {
      rootOf.set(row.thread.id, familyRootId(facts.parentOf, row.thread.id));
    }
  }
  const pinned: DisplayRow[] = [];
  const pinnedIds = new Set<string>();
  const dated: DisplayRow[] = [];
  const folderRows = new Map<string, DisplayRow[]>();
  const folderMembers = new Map<string, Set<string>>();
  const folderOf = new Map<string, string>();
  const folderOrder: string[] = [];
  for (const row of rows) {
    const root = rootOf.get(row.thread.id)!;
    if (facts.isPinned(root)) {
      pinned.push(row);
      pinnedIds.add(row.thread.id);
      continue;
    }
    const folderId = facts.sectionIdOf(root);
    if (folderId !== null && facts.knownFolderIds.has(folderId)) {
      let held = folderRows.get(folderId);
      if (!held) {
        held = [];
        folderRows.set(folderId, held);
        folderMembers.set(folderId, new Set());
        folderOrder.push(folderId);
      }
      held.push(row);
      folderMembers.get(folderId)!.add(row.thread.id);
      folderOf.set(row.thread.id, folderId);
      continue;
    }
    dated.push(row);
  }
  return {
    pinned,
    pinnedIds,
    folders: folderOrder.map((sectionId) => ({
      sectionId,
      rows: folderRows.get(sectionId)!,
      memberIds: folderMembers.get(sectionId)!,
    })),
    folderOf,
    dated,
  };
}

export const UNFILED_GROUP_KEY = "__none__";

export interface FolderMovePlan {
  /** The family needs a native section write. */
  writeSection: boolean;
  /** The family root needs a native unpin so the move stays visible. */
  writePin: boolean;
}

/** The outcome of one filing attempt, for truthful per-part reporting. */
export interface FolderMoveResult {
  /** Ids the host refused to file; empty on a full section write. */
  sectionFailed: string[];
  /** True when the section write applied but the root unpin did not. */
  pinFailed: boolean;
  /** Whether the family root was pinned before the move. */
  wasPinned: boolean;
}

/**
 * One rule for every filing path (dialog, drag, row action): filing or
 * unfiling a family always unpins its root, because a pinned family would
 * otherwise stay in Pinned and the move would appear to do nothing. Parts
 * that already match are skipped, so repeating a move is a silent no-op.
 */
export function planFolderMove(
  currentSection: string | null,
  wantSection: string | null,
  rootPinned: boolean,
): FolderMovePlan {
  return {
    writeSection: wantSection !== currentSection,
    writePin: rootPinned,
  };
}

/**
 * The drag/keyboard reorder group of one thread: pinned, one folder, or one
 * age group. Reorder ids are built per key, so a move never crosses into
 * another cluster and never reassigns pin or folder state.
 */
export function standaloneGroupKey(options: {
  threadId: string;
  parentOf: (threadId: string) => string | null;
  sectionIdOf: (threadId: string) => string | null;
  isPinned: (threadId: string) => boolean;
  knownFolderIds: ReadonlySet<string>;
  ageGroupOf: (threadId: string) => string | null;
}): string {
  const root = familyRootId(options.parentOf, options.threadId);
  if (options.isPinned(root)) return "pinned";
  const folderId = options.sectionIdOf(root);
  if (folderId !== null && options.knownFolderIds.has(folderId)) {
    return `folder:${folderId}`;
  }
  return `age:${options.ageGroupOf(options.threadId) ?? "unknown"}`;
}
