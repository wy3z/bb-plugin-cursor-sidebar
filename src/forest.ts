/**
 * The display forest, built per native project.
 *
 * Project membership is authoritative: a thread is always drawn under the
 * project its own `projectId` names, even when its native parent lives in a
 * different project. Following a parent's link across projects would hide a B
 * child under its A parent and lose it from B entirely.
 *
 * Within one project the forest is acyclic and total: deterministic roots,
 * deterministic child order, every member visited exactly once. A parent cycle
 * (a → b → a) is broken by drawing the earliest member as a root, so no
 * thread is ever dropped by a cycle. Native parent ids are never rewritten.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { ThreadShelf } from "./lifecycle";
import { orderByStoredIds, siblingScope } from "./thread-order";

export interface DisplayForest {
  /** Display parent within the project, or null at a top level. */
  parent: ReadonlyMap<string, string | null>;
  /** Display children within the project, newest first. */
  children: ReadonlyMap<string, PluginSidebarThread[]>;
}

/** One row of a shelf, flattened with the connector data it needs. */
export interface DisplayRow {
  thread: PluginSidebarThread;
  /** Levels below the top; 0 draws no connector at all. */
  depth: number;
  /**
   * One entry per level above this row: whether that level's rail carries on
   * below it. The final entry is this row's own parent — false closes the
   * line at the elbow.
   */
  guides: boolean[];
  /** This row opens a rail of its own for the rows under it. */
  opens: boolean;
}

/**
 * One native project's section. `byShelf` is the flat partition the renderer
 * turns back into trees, keeping a settled child under its settled parent but
 * never under an active one.
 */
export interface ProjectSectionData {
  /** Native project id, or an unknown id used verbatim. */
  id: string;
  name: string;
  known: boolean;
  /** The implicit personal container; never part of native project reorder. */
  personal: boolean;
  members: readonly PluginSidebarThread[];
  forest: DisplayForest;
  shelfById: ReadonlyMap<string, ThreadShelf>;
  byShelf: Readonly<Record<ThreadShelf, readonly PluginSidebarThread[]>>;
  /** Base sibling order per scope, used to merge a drag into the full set. */
  scopeIds: ReadonlyMap<string, readonly string[]>;
}

/** Total, stable order: newest first, id as the tie-breaker. */
function compareThreads(
  left: PluginSidebarThread,
  right: PluginSidebarThread,
): number {
  return right.createdAt - left.createdAt || left.id.localeCompare(right.id);
}

/**
 * The user's pins lead their sibling list. Applied as a stable partition after
 * the stored order, so a drag inside a partition keeps working and pin state
 * is never changed by reordering.
 */
function pinnedFirst(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  return [...threads].sort(
    (left, right) => Number(right.isPinned) - Number(left.isPinned),
  );
}

/**
 * Build the acyclic display forest for one project's members.
 *
 * Roots are members with no parent in this project (a missing, archived, or
 * cross-project parent all count), walked newest first. Members still
 * unvisited after that are exactly the cycles, and are walked as roots in the
 * same deterministic order. `visited` is what makes both walks total.
 */
export function buildDisplayForest(
  threads: readonly PluginSidebarThread[],
): DisplayForest {
  const memberIds = new Set(threads.map((thread) => thread.id));
  const childBuckets = new Map<string, PluginSidebarThread[]>();
  const nativeParent = new Map<string, string | null>();

  for (const thread of threads) {
    const parentId = thread.parentThreadId;
    if (parentId !== null && parentId !== thread.id && memberIds.has(parentId)) {
      nativeParent.set(thread.id, parentId);
      const bucket = childBuckets.get(parentId);
      if (bucket) bucket.push(thread);
      else childBuckets.set(parentId, [thread]);
    } else {
      nativeParent.set(thread.id, null);
    }
  }

  const ordered = [...threads].sort(compareThreads);
  const parent = new Map<string, string | null>();
  const children = new Map<string, PluginSidebarThread[]>();
  const visited = new Set<string>();

  const visit = (thread: PluginSidebarThread, parentId: string | null) => {
    if (visited.has(thread.id)) return;
    visited.add(thread.id);
    parent.set(thread.id, parentId);
    const kids = (childBuckets.get(thread.id) ?? [])
      .filter((kid) => !visited.has(kid.id))
      .sort(compareThreads);
    children.set(thread.id, kids);
    for (const kid of kids) visit(kid, thread.id);
  };

  for (const thread of ordered) {
    if (nativeParent.get(thread.id) === null) visit(thread, null);
  }
  // Everything left is reachable only through a cycle; draw it as roots too.
  for (const thread of ordered) {
    if (!visited.has(thread.id)) visit(thread, null);
  }

  return { parent, children };
}

/**
 * Order each sibling group by its stored order, then hand the flat shelf
 * partitions back in that total order. Ordering is applied before the shelf
 * split so a settled child keeps its place relative to its settled siblings.
 */
function orderedMembers(
  projectId: string,
  members: readonly PluginSidebarThread[],
  forest: DisplayForest,
  orderForScope: (scope: string) => readonly string[] | null,
): {
  forest: DisplayForest;
  scopeIds: Map<string, readonly string[]>;
  rank: Map<string, number>;
} {
  const scopeIds = new Map<string, readonly string[]>();
  const orderedChildren = new Map<string, PluginSidebarThread[]>();

  const reorder = (parentId: string | null): PluginSidebarThread[] => {
    const base = (
      parentId === null
        ? members.filter((thread) => forest.parent.get(thread.id) === null)
        : (forest.children.get(parentId) ?? [])
    ).sort(compareThreads);
    if (base.length === 0) return base;
    const scope = siblingScope(projectId, parentId);
    scopeIds.set(scope, base.map((thread) => thread.id));
    const ordered = pinnedFirst(orderByStoredIds(base, orderForScope(scope)));
    if (parentId !== null) orderedChildren.set(parentId, ordered);
    return ordered;
  };

  const emitted = new Set<string>();
  const walk = (thread: PluginSidebarThread) => {
    if (emitted.has(thread.id)) return;
    emitted.add(thread.id);
    for (const child of reorder(thread.id)) walk(child);
  };
  const orderedRoots = reorder(null);
  for (const root of orderedRoots) walk(root);

  const rank = new Map<string, number>();
  let next = 0;
  const assign = (thread: PluginSidebarThread) => {
    rank.set(thread.id, next++);
    for (const child of orderedChildren.get(thread.id) ?? []) assign(child);
  };
  for (const root of orderedRoots) assign(root);

  const children = new Map<string, PluginSidebarThread[]>();
  for (const thread of members) {
    children.set(thread.id, orderedChildren.get(thread.id) ?? []);
  }
  return {
    forest: { parent: forest.parent, children },
    scopeIds,
    rank,
  };
}

/**
 * Group visible threads into sections by native project membership. Every
 * known project gets a section in BB's own order, including empty ones. A
 * thread whose project is unknown gets its own section keyed by that id, so
 * two unrelated unknown projects never share a heading.
 */
export function buildSections(
  visible: readonly PluginSidebarThread[],
  projects: readonly { id: string; name: string; isPersonal?: boolean }[],
  shelfOf: (thread: PluginSidebarThread) => ThreadShelf,
  orderForScope: (scope: string) => readonly string[] | null,
): ProjectSectionData[] {
  const memberGroups = new Map<string, PluginSidebarThread[]>();
  const firstSeen: string[] = [];
  for (const thread of visible) {
    let group = memberGroups.get(thread.projectId);
    if (group === undefined) {
      group = [];
      memberGroups.set(thread.projectId, group);
      firstSeen.push(thread.projectId);
    }
    group.push(thread);
  }

  const knownNames = new Map(projects.map((project) => [project.id, project.name]));
  const personalIds = new Set(
    projects.filter((project) => project.isPersonal === true).map((project) => project.id),
  );
  const orderedIds = [
    ...projects.map((project) => project.id),
    ...firstSeen.filter((id) => !knownNames.has(id)),
  ];

  return orderedIds.map((id) => {
    const members = memberGroups.get(id) ?? [];
    const base = buildDisplayForest(members);
    const { forest, scopeIds, rank } = orderedMembers(id, members, base, orderForScope);
    const shelfById = new Map<string, ThreadShelf>();
    const byShelf: Record<ThreadShelf, PluginSidebarThread[]> = {
      active: [],
      settled: [],
    };
    for (const thread of members) {
      const shelf = shelfOf(thread);
      shelfById.set(thread.id, shelf);
      byShelf[shelf].push(thread);
    }
    for (const shelf of ["active", "settled"] as const) {
      byShelf[shelf].sort(
        (left, right) =>
          (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0),
      );
    }
    return {
      id,
      name: knownNames.get(id) ?? id,
      known: knownNames.has(id),
      personal: personalIds.has(id),
      members,
      forest,
      shelfById,
      byShelf,
      scopeIds,
    };
  });
}

/**
 * Flatten one shelf into rows with depth and connector flags. The walk is the
 * same one that orders the rows, so the rails can never point at the wrong
 * row, and `inShelf` is what keeps a parked child from hanging off an active
 * parent. A collapsed parent contributes its own row but not its descendants.
 */
export function flattenShelf(
  section: ProjectSectionData,
  shelf: ThreadShelf,
  isExpanded: (threadId: string) => boolean = () => true,
): DisplayRow[] {
  const inShelf = new Set(section.byShelf[shelf].map((thread) => thread.id));
  const roots = section.byShelf[shelf].filter((thread) => {
    const parentId = section.forest.parent.get(thread.id);
    return parentId === null || parentId === undefined || !inShelf.has(parentId);
  });

  const rows: DisplayRow[] = [];
  const seen = new Set<string>();
  const walk = (thread: PluginSidebarThread, depth: number, guides: boolean[]) => {
    if (seen.has(thread.id)) return;
    seen.add(thread.id);
    const children = isExpanded(thread.id)
      ? (section.forest.children.get(thread.id) ?? []).filter(
          (child) => inShelf.has(child.id) && !seen.has(child.id),
        )
      : [];
    const row: DisplayRow = { thread, depth, guides, opens: false };
    rows.push(row);
    const before = rows.length;
    children.forEach((child, index) =>
      walk(child, depth + 1, [...guides, index < children.length - 1]),
    );
    row.opens = rows.length > before;
  };

  for (const root of roots) walk(root, 0, []);
  return rows;
}

/** The persisted scope key of a thread's sibling group in one section. */
export function scopeOf(
  section: ProjectSectionData,
  threadId: string,
): string {
  return siblingScope(section.id, section.forest.parent.get(threadId) ?? null);
}
