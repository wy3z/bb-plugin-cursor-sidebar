import type { ReactNode } from "react";
import { toast } from "sonner";
import { useBbNavigate, useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  archiveMany,
  copyBranch,
  copyPullRequestLink,
  copyThreadId,
  copyThreadLink,
  copyTranscript,
  exportTranscript,
  forkThread,
  rowsBelow,
} from "./row-extras";
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
  onSetProjectIcon,
  extraActions,
  resolveThread,
  children,
}: {
  /** Looks up a sidebar thread by id, for Archive all below. */
  resolveThread?: (threadId: string) => PluginSidebarThread | undefined;
  /** Extra entries placed right after "Open in split". */
  extraActions?: readonly SidebarAction[];
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
  /** Set the icon of the native project this thread belongs to, when it has one. */
  onSetProjectIcon?: () => void;
  swipeDisabled?: boolean;
  /** Touch long-press pick-up for a reorder drag; true means it took over. */
  onReorderStart?: (pointerId: number, clientX: number, clientY: number) => boolean;
}) {
  const actions = useThreadMutations();
  const sdk = useSdk() as never;
  const navigate = useBbNavigate();
  // Delete is bb's own thread action, so its confirmation and child count stay
  // the host's.
  const remove = useCoreThreadAction(thread, "delete");

  // Native order (Open, Rename / read + pin / Archive, Delete) with the
  // family-scoped extras alongside their native cousins. Everything else is a
  // plain native call kept for parity.
  const items: SidebarAction[] = [];
  items.push({ label: "Open in split", run: () => { actions.open(thread.id, { split: true }); onOpen?.(); } });
  if (extraActions) items.push(...extraActions);
  items.push({
    label: "New thread here",
    run: () =>
      navigate.toCompose({
        projectId: thread.projectId,
        ...(thread.environment?.id ? { environmentId: thread.environment.id } : {}),
        focusPrompt: true,
      }),
  });
  items.push({ label: "Fork", run: () => void forkThread(sdk, thread, (id) => actions.open(id)) });
  if (onRename) items.push({ label: "Rename", run: onRename });
  if (onRename) {
    items.push({
      label: "Regenerate name",
      run: () => {
        actions.regenerateTitle(thread.id).catch((error: unknown) => {
          toast.error("Couldn't regenerate the name", {
            description: error instanceof Error ? error.message : String(error),
          });
        });
      },
    });
  }
  if (onToggleChildren) items.push({ label: expanded ? "Collapse children" : "Expand children", run: onToggleChildren });
  items.push({ label: thread.isUnread ? "Mark read" : "Mark unread", run: () => void actions.setRead(thread.id, thread.isUnread), separatorBefore: true });
  if (onTogglePin) {
    items.push({ label: pinActionLabel(isPinned ?? false), run: onTogglePin });
  }
  if (onRemoveFromFolder) items.push({ label: "Remove family from folder", run: onRemoveFromFolder });
  items.push({
    label: "Copy",
    run: () => undefined,
    separatorBefore: true,
    children: [
      { label: "Link", run: () => void copyThreadLink(thread) },
      ...(thread.environment?.branchName ? [{ label: "Branch name", run: () => void copyBranch(thread) }] : []),
      ...(thread.environment?.id ? [{ label: "Pull request link", run: () => void copyPullRequestLink(sdk, thread) }] : []),
      { label: "Transcript", run: () => void copyTranscript(sdk, thread) },
      { label: "Thread ID", run: () => void copyThreadId(thread) },
    ],
  });
  items.push({ label: "Export transcript…", run: () => void exportTranscript(sdk, thread) });
  if (onSetProjectIcon) items.push({ label: "Set project icon…", run: onSetProjectIcon, separatorBefore: true });
  items.push({ label: "Archive", run: onArchive, separatorBefore: true });
  if (resolveThread) {
    items.push({
      label: "Archive all below",
      run: () => {
        const below = rowsBelow(thread.id)
          .map((id) => resolveThread(id))
          .filter((item): item is PluginSidebarThread => item !== undefined);
        void archiveMany(sdk, below, "below this one");
      },
    });
  }
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
