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
 * How a section orders siblings. `manual` keeps the stored scope order (with
 * the recency fallback); an automatic ordering replaces it with `compare`.
 * Either way the display parent and the shelf partition are untouched, so
 * ordering never changes ancestry or membership.
 */
export interface SiblingOrdering {
  compare: (left: PluginSidebarThread, right: PluginSidebarThread) => number;
  manual: boolean;
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
  ordering?: SiblingOrdering | undefined,
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
    ).sort(ordering?.compare ?? compareThreads);
    if (base.length === 0) return base;
    const scope = siblingScope(projectId, parentId);
    scopeIds.set(scope, base.map((thread) => thread.id));
    // An automatic ordering ignores the stored manual order; manual keeps it.
    const ordered = ordering && !ordering.manual
      ? base
      : orderByStoredIds(base, orderForScope(scope));
    // A native pin sorts a sibling ahead of its unpinned siblings at the same
    // level, stably, with the stored manual order kept as the tiebreak inside
    // each partition. Only sibling order changes: the display parent is
    // untouched, so a nested pinned grandchild keeps its parent.
    const pinnedFirst = [
      ...ordered.filter((thread) => thread.isPinned),
      ...ordered.filter((thread) => !thread.isPinned),
    ];
    if (parentId !== null) orderedChildren.set(parentId, pinnedFirst);
    return pinnedFirst;
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
 *
 * `orderingFor` resolves the sibling ordering per section. Native project
 * interiors stay newest-first; standalone chats take the selected automatic
 * order, or keep stored sibling order when Manual is chosen.
 */
export function buildSections(
  visible: readonly PluginSidebarThread[],
  projects: readonly { id: string; name: string; isPersonal?: boolean }[],
  shelfOf: (thread: PluginSidebarThread) => ThreadShelf,
  orderForScope: (scope: string) => readonly string[] | null,
  orderingFor?: ((sectionId: string) => SiblingOrdering | undefined) | undefined,
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
    const { forest, scopeIds, rank } = orderedMembers(id, members, base, orderForScope, orderingFor?.(id));
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
 *
 * `includes` bounds both the emitted rows and the walked children to a
 * presentation subset (the conversation preview or a single revealed path): an
 * excluded grouping row such as a Project Manager is still walked as a parent,
 * so its kept children keep their real depth and rails instead of collapsing to
 * roots, while excluded subtrees contribute nothing (no dangling rails).
 *
 * `hasTrailingSibling` marks a grouping row as having one more sibling that the
 * renderer draws itself (the bounded preview's "Show more" row). Its last child
 * then keeps its rail open so the final branch reaches that row.
 */
export function flattenShelf(
  section: ProjectSectionData,
  shelf: ThreadShelf,
  isExpanded: (threadId: string) => boolean = () => true,
  includes: (threadId: string) => boolean = () => true,
  hasTrailingSibling: (threadId: string) => boolean = () => false,
  childLimit: (threadId: string) => number = () => Number.POSITIVE_INFINITY,
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
      ? (section.forest.children.get(thread.id) ?? [])
          .filter(
            (child) => inShelf.has(child.id) && includes(child.id) && !seen.has(child.id),
          )
          .slice(0, Math.max(0, childLimit(thread.id)))
      : [];
    const row: DisplayRow | null = includes(thread.id)
      ? { thread, depth, guides, opens: false }
      : null;
    if (row !== null) rows.push(row);
    const before = rows.length;
    const trailing = hasTrailingSibling(thread.id) ? 1 : 0;
    children.forEach((child, index) =>
      walk(child, depth + 1, [
        ...guides,
        index < children.length - 1 + trailing,
      ]),
    );
    if (row !== null) row.opens = rows.length > before;
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

/** One pooled ordinary section for Updated / Status / Environment: every home's members sharing the standalone buckets. */
export function buildPooledOrdinarySection(
  homes: readonly ProjectSectionData[],
  id: string,
  name: string,
): ProjectSectionData {
  const members: PluginSidebarThread[] = [];
  const parent = new Map<string, string | null>();
  const children = new Map<string, PluginSidebarThread[]>();
  const shelfById = new Map<string, ThreadShelf>();
  const active: PluginSidebarThread[] = [];
  const settled: PluginSidebarThread[] = [];
  const scopeIds = new Map<string, readonly string[]>();
  for (const home of homes) {
    for (const thread of home.members) {
      members.push(thread);
      parent.set(thread.id, home.forest.parent.get(thread.id) ?? null);
      children.set(thread.id, home.forest.children.get(thread.id) ?? []);
    }
    for (const thread of home.byShelf.active) {
      shelfById.set(thread.id, "active");
      active.push(thread);
    }
    for (const thread of home.byShelf.settled) {
      shelfById.set(thread.id, "settled");
      settled.push(thread);
    }
    for (const [scope, ids] of home.scopeIds) scopeIds.set(scope, ids);
  }
  return {
    id,
    name,
    known: true,
    personal: true,
    members,
    forest: { parent, children },
    shelfById,
    byShelf: { active, settled },
    scopeIds,
  };
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * The visible ancestor chain from a section root down to `activeThreadId`, in
 * root-first order. Empty when the active thread is not a member of this
 * section. Used to reveal and highlight the selected path.
 */
export function activePathIds(
  section: ProjectSectionData,
  activeThreadId: string | null,
  excluded: ReadonlySet<string> = EMPTY_IDS,
): string[] {
  if (activeThreadId === null) return [];
  if (!section.members.some((thread) => thread.id === activeThreadId)) return [];
  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = activeThreadId;
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    if (!excluded.has(cursor)) chain.push(cursor);
    cursor = section.forest.parent.get(cursor) ?? null;
  }
  return chain.reverse();
}
