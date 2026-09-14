/**
 * The pin decisions shared by the sidebar's row consumer and the row menu. Kept
 * pure and SDK-free so the exact writes a toggle performs, and the label the
 * menu shows, are exercised directly against the production functions.
 */
export type PinHomeKind = "core" | "project" | "chats";

export interface PinWrite {
  threadId: string;
  pinned: boolean;
}

/**
 * Whether a row may be pinned. An archived row never pins. In an ordinary home
 * a managed worker or coordinator anywhere on the path blocks filing/pinning.
 * A Core home writes only sibling-order pin metadata, so the ownership path
 * does not block it.
 */
export function pinAllowed(
  homeKind: PinHomeKind,
  archived: boolean,
  crossedProtected: boolean,
): boolean {
  if (archived) return false;
  if (homeKind === "core") return true;
  return !crossedProtected;
}

/**
 * The native writes one pin toggle performs.
 *
 * A Core home writes only the row's own flag, so it just orders siblings and
 * never lifts a family or clears another member's pin. An ordinary home lifts
 * the family by pinning its root, and on unpin clears every pinned member so a
 * child pin that lifted the family is undone.
 */
export function planPinWrites(input: {
  homeKind: PinHomeKind;
  threadId: string;
  rootId: string;
  familyIds: readonly string[];
  pinnedMemberIds: readonly string[];
  pinned: boolean;
}): readonly PinWrite[] {
  if (input.homeKind === "core") {
    return [{ threadId: input.threadId, pinned: input.pinned }];
  }
  if (input.pinned) {
    return [{ threadId: input.rootId, pinned: true }];
  }
  return input.familyIds
    .filter((id) => input.pinnedMemberIds.includes(id))
    .map((id) => ({ threadId: id, pinned: false }));
}

/** The row-menu label for a pin toggle, family or sibling scope. */
export function pinActionLabel(sibling: boolean, isPinned: boolean): string {
  if (sibling) return isPinned ? "Unpin" : "Pin";
  return isPinned ? "Unpin family" : "Pin family";
}
