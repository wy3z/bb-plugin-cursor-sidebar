import type { ReactNode } from "react";
import { experimental_useSidebarThreadActions as useSidebarThreadActions, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { SidebarActions, type SidebarAction } from "./SidebarActions";
import { threadDisplayTitle } from "./inbox";
import { pinActionLabel } from "./pin-scope";
import type { CoreRowRole, ThreadOwnershipHint } from "./core-ownership";

export function RowContextMenu({ thread, onRename, onOpen, onMove, onStartProject, onHandOver, onReference, onRemoveFromCore, onConfirmOwnership, onKeepAsReference, onToggleChildren, expanded, onTogglePin, isPinned, pinSibling, onMoveToFolder, onRemoveFromFolder, coreRole, ownershipHint, referenceOpeners, onOpenReferenceCore, children }: {
  thread: PluginSidebarThread; onRename?: () => void; onOpen?: () => void; onMove?: () => void;
  onStartProject?: () => void;
  onHandOver?: () => void;
  onReference?: () => void;
  /** Release a Core-owned ordinary chat back to its native home. */
  onRemoveFromCore?: () => void;
  /** Explicitly confirm an unverified legacy association as Core-owned. */
  onConfirmOwnership?: () => void;
  /** Explicitly keep an unverified legacy association as a non-owning link. */
  onKeepAsReference?: () => void;
  onToggleChildren?: () => void; expanded?: boolean; children: ReactNode;
  /** Native pin toggle; present only where pinnable. */
  onTogglePin?: () => void; isPinned?: boolean;
  /**
   * True in a Core home, where the pin writes only this row's own native flag
   * and orders siblings. False/omitted in an ordinary home, where the pin lifts
   * or clears the whole family.
   */
  pinSibling?: boolean;
  /** Folder filing for a family; present only where available. */
  onMoveToFolder?: () => void; onRemoveFromFolder?: () => void;
  /** How this row sits under its Core, when it is Core-owned. */
  coreRole?: CoreRowRole | null;
  /** Verified owned, unverified legacy or reference provenance, when known. */
  ownershipHint?: ThreadOwnershipHint | null;
  /** One opener per Core that references this row; a non-owning link only. */
  referenceOpeners?: readonly { coreId: string; label: string }[] | undefined;
  onOpenReferenceCore?: ((coreId: string) => void) | undefined;
}) {
  const native = useSidebarThreadActions();
  const actions: SidebarAction[] = [];
  if (onToggleChildren) actions.push({ label: expanded ? "Collapse children" : "Expand children", run: onToggleChildren });
  actions.push({ label: "Open in split", run: () => { native.open(thread.id, { split: true }); onOpen?.(); } });
  // Pin state and filing are family properties held by the family root, except
  // in a Core home, where the pin is this row's own sibling-ordering flag.
  if (onTogglePin) {
    actions.push({ label: pinActionLabel(pinSibling ?? false, isPinned ?? false), run: onTogglePin });
  }
  if (onMoveToFolder) actions.push({ label: "Move family to folder…", run: onMoveToFolder });
  if (onRemoveFromFolder) actions.push({ label: "Remove family from folder", run: onRemoveFromFolder });
  if (onStartProject) actions.push({ label: "Start Core from thread", run: onStartProject });
  if (onHandOver) actions.push({ label: "Hand over to Core…", run: onHandOver });
  if (onReference) actions.push({ label: "Add as reference only…", run: onReference });
  if (onConfirmOwnership) actions.push({ label: "Confirm Core ownership", run: onConfirmOwnership });
  if (onKeepAsReference) actions.push({ label: "Keep as Core reference", run: onKeepAsReference });
  if (onOpenReferenceCore) {
    for (const opener of referenceOpeners ?? []) {
      actions.push({ label: opener.label, run: () => onOpenReferenceCore(opener.coreId) });
    }
  }
  if (onMove) actions.push({ label: "Move to Core…", run: onMove });
  if (onRemoveFromCore) actions.push({ label: "Remove from Core", run: onRemoveFromCore });
  if (onRename) actions.push({ label: "Rename", run: onRename });
  actions.push({ label: thread.isUnread ? "Mark read" : "Mark unread", run: () => void native.setRead(thread.id, thread.isUnread) });
  actions.push({ label: "Archive", run: () => native.archive(thread.id) });
  actions.push({ label: "Delete", run: () => native.requestDelete(thread.id), destructive: true });
  return <SidebarActions label={threadDisplayTitle(thread)} onHold={onToggleChildren} actions={actions}>{children}</SidebarActions>;
}
