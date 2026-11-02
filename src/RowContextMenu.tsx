import type { ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { SidebarActions, type SidebarAction } from "./SidebarActions";
import { threadDisplayTitle } from "./inbox";
import { pinActionLabel } from "./pin-scope";
import { useCoreThreadAction, useThreadMutations } from "./thread-actions";
import type { RowSwipeBinding } from "./useRowGesture";

export function RowContextMenu({
  thread,
  onRename,
  onOpen,
  onArchive,
  onToggleChildren,
  expanded,
  onTogglePin,
  isPinned,
  onRemoveFromFolder,
  swipeDisabled,
  onReorderStart,
  children,
}: {
  thread: PluginSidebarThread;
  onRename?: () => void;
  onOpen?: () => void;
  /** Archive this row; the row owns bb's archive action so both entry points share it. */
  onArchive: () => void;
  onToggleChildren?: () => void;
  expanded?: boolean;
  children: ReactNode;
  onTogglePin?: () => void;
  isPinned?: boolean;
  onRemoveFromFolder?: () => void;
  swipeDisabled?: boolean;
  /** Touch long-press pick-up for a reorder drag; true means it took over. */
  onReorderStart?: (pointerId: number, clientX: number, clientY: number) => boolean;
}) {
  const actions = useThreadMutations();
  // Delete is bb's own thread action, so its confirmation and child count stay
  // the host's.
  const remove = useCoreThreadAction(thread, "delete");

  // Native order (Open, Rename / read + pin / Archive, Delete) with the
  // family-scoped extras alongside their native cousins. Everything else is a
  // plain native call kept for parity.
  const items: SidebarAction[] = [];
  items.push({ label: "Open in split", run: () => { actions.open(thread.id, { split: true }); onOpen?.(); } });
  if (onRename) items.push({ label: "Rename", run: onRename });
  if (onToggleChildren) items.push({ label: expanded ? "Collapse children" : "Expand children", run: onToggleChildren });
  items.push({ label: thread.isUnread ? "Mark read" : "Mark unread", run: () => void actions.setRead(thread.id, thread.isUnread), separatorBefore: true });
  if (onTogglePin) {
    items.push({ label: pinActionLabel(isPinned ?? false), run: onTogglePin });
  }
  if (onRemoveFromFolder) items.push({ label: "Remove family from folder", run: onRemoveFromFolder });
  items.push({ label: "Archive", run: onArchive, separatorBefore: true });
  // Deleting without bb's confirmation is never an option, so the entry only
  // exists while bb contributes the action that owns it.
  if (remove !== null) {
    items.push({ label: "Delete", run: () => void remove.run(), destructive: true });
  }
  // Pin towards the end of the row, archive the other way: pinning is
  // reversible and worth keeping, archiving takes the row away.
  const swipe: RowSwipeBinding | undefined = swipeDisabled
    ? undefined
    : {
        ...(onTogglePin !== undefined
          ? {
              left: {
                label: pinActionLabel(isPinned ?? false),
                icon: isPinned ? "PinOff" : "Pin",
                run: onTogglePin,
              },
            }
          : {}),
        right: {
          label: "Archive",
          icon: "Archive",
          destructive: true,
          run: onArchive,
        },
      };
  // No hold action: on touch a hold opens this menu, and the menu carries the
  // children toggle. A row with children used to spend its hold on expanding
  // them, which left rename, read, pin, archive and delete out of reach on a
  // phone.
  return (
    <SidebarActions label={threadDisplayTitle(thread)} onReorderStart={onReorderStart} actions={items} swipe={swipe}>
      {children}
    </SidebarActions>
  );
}
