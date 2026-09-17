import type { ReactNode } from "react";
import { experimental_useSidebarThreadActions as useSidebarThreadActions, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { SidebarActions, type SidebarAction } from "./SidebarActions";
import { threadDisplayTitle } from "./inbox";
import { pinActionLabel } from "./pin-scope";
import type { RowSwipeBinding } from "./useRowGesture";

export function RowContextMenu({
  thread,
  onRename,
  onOpen,
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
  const native = useSidebarThreadActions();
  // Native order (Open, Rename / read + pin / Archive, Delete) with the
  // family-scoped extras alongside their native cousins. Everything else is a
  // plain native call kept for parity.
  const actions: SidebarAction[] = [];
  actions.push({ label: "Open in split", run: () => { native.open(thread.id, { split: true }); onOpen?.(); } });
  if (onRename) actions.push({ label: "Rename", run: onRename });
  if (onToggleChildren) actions.push({ label: expanded ? "Collapse children" : "Expand children", run: onToggleChildren });
  actions.push({ label: thread.isUnread ? "Mark read" : "Mark unread", run: () => void native.setRead(thread.id, thread.isUnread), separatorBefore: true });
  if (onTogglePin) {
    actions.push({ label: pinActionLabel(isPinned ?? false), run: onTogglePin });
  }
  if (onRemoveFromFolder) actions.push({ label: "Remove family from folder", run: onRemoveFromFolder });
  actions.push({ label: "Archive", run: () => native.archive(thread.id), separatorBefore: true });
  actions.push({ label: "Delete", run: () => native.requestDelete(thread.id), destructive: true });
  const swipe: RowSwipeBinding | undefined = swipeDisabled
    ? undefined
    : {
        leftLabel: "Archive",
        onSwipeLeft: () => native.archive(thread.id),
        ...(onTogglePin !== undefined
          ? {
              rightLabel: pinActionLabel(isPinned ?? false),
              onSwipeRight: onTogglePin,
            }
          : {}),
      };
  const hold = swipeDisabled ? undefined : onToggleChildren;
  return (
    <SidebarActions label={threadDisplayTitle(thread)} onHold={hold} onReorderStart={onReorderStart} actions={actions} swipe={swipe}>
      {children}
    </SidebarActions>
  );
}
