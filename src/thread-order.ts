/**
 * Persistent ordering helpers for project sections and sibling threads.
 *
 * Ported from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */

export type DropPlacement = "before" | "after";

/** Insert `movingId` next to `targetId`, returning a new array. */
export function moveId(
  ids: readonly string[],
  movingId: string,
  targetId: string,
  placement: DropPlacement,
): string[] {
  if (movingId === targetId || !ids.includes(movingId) || !ids.includes(targetId)) {
    return [...ids];
  }
  const remaining = ids.filter((id) => id !== movingId);
  const targetIndex = remaining.indexOf(targetId);
  const insertionIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...remaining.slice(0, insertionIndex),
    movingId,
    ...remaining.slice(insertionIndex),
  ];
}

/** Move `movingId` one slot up or down. */
export function moveIdByOffset(
  ids: readonly string[],
  movingId: string,
  offset: -1 | 1,
): string[] {
  const currentIndex = ids.indexOf(movingId);
  const targetIndex = currentIndex + offset;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ids.length) {
    return [...ids];
  }
  return moveId(ids, movingId, ids[targetIndex]!, offset < 0 ? "before" : "after");
}

/**
 * Reorder `threads` by a stored id list. Ids the list does not name keep their
 * incoming (recency) place ahead of named ones, so a thread that has not been
 * dragged yet still appears at the top rather than vanishing.
 */
export function orderByStoredIds<T extends { readonly id: string }>(
  threads: readonly T[],
  orderedIds: readonly string[] | null,
): T[] {
  if (orderedIds === null) return [...threads];
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...threads].sort((left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return -1;
    if (rightRank === undefined) return 1;
    return leftRank - rightRank;
  });
}

/**
 * Replace the visible slots of a global order with a new visible order,
 * leaving every hidden id in place. Parked siblings keep their positions when
 * an active sibling is dragged past them.
 */
export function mergeVisibleOrder(
  globalIds: readonly string[],
  visibleIds: readonly string[],
): string[] {
  const visibleSet = new Set(visibleIds);
  let visibleIndex = 0;
  return globalIds.map((id) =>
    visibleSet.has(id) ? (visibleIds[visibleIndex++] ?? id) : id,
  );
}

/**
 * Reconcile a stored order against the complete current id set. Stored ids
 * that still exist keep their stored order; current ids the store has never
 * seen (a new sibling, or a settled sibling that just became visible) are
 * appended in their base order. Removed ids are dropped. Hidden siblings keep
 * their stored slot rather than being reset.
 */
export function reconcileOrder(
  stored: readonly string[] | null,
  base: readonly string[],
): string[] {
  if (stored === null) return [...base];
  const baseSet = new Set(base);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of stored) {
    if (baseSet.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of base) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

/** The persisted scope key for one sibling group: project + native parent. */
export function siblingScope(projectId: string, parentId: string | null): string {
  return `siblings::${projectId}::${parentId ?? "__root__"}`;
}
