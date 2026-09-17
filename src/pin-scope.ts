/**
 * The pin decisions shared by the sidebar's row consumer and the row menu. Kept
 * pure and SDK-free so the exact writes a toggle performs, and the label the
 * menu shows, are exercised directly against the production functions.
 */
export type PinHomeKind = "project" | "chats";

export interface PinWrite {
  threadId: string;
  pinned: boolean;
}

/**
 * Whether a row may be pinned. An archived row never pins.
 */
export function pinAllowed(
  _homeKind: PinHomeKind,
  archived: boolean,
  crossedProtected: boolean,
): boolean {
  if (archived) return false;
  return !crossedProtected;
}

/**
 * The native writes one pin toggle performs.
 *
 * An ordinary home lifts the family by pinning its root, and on unpin clears
 * every pinned member so a child pin that lifted the family is undone.
 */
export function planPinWrites(input: {
  homeKind: PinHomeKind;
  threadId: string;
  rootId: string;
  familyIds: readonly string[];
  pinnedMemberIds: readonly string[];
  pinned: boolean;
}): readonly PinWrite[] {
  void input.homeKind;
  void input.threadId;
  if (input.pinned) {
    return [{ threadId: input.rootId, pinned: true }];
  }
  return input.familyIds
    .filter((id) => input.pinnedMemberIds.includes(id))
    .map((id) => ({ threadId: id, pinned: false }));
}

/** The row-menu label for a pin toggle. The toggle always lifts the whole family. */
export function pinActionLabel(isPinned: boolean): string {
  return isPinned ? "Unpin" : "Pin";
}
