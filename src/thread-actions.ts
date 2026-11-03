// Thread writes from the 0.6 SDK surface.
//
// SDK 0.6 retired `experimental_useSidebarThreadActions`, whose imperative
// `open`/`setPinned`/`setRead`/`rename`/`archive`/`requestDelete` bundle this
// sidebar used. Writes now go through the public SDK client and navigation,
// while archive and delete go through bb's own thread actions so their
// confirmations, cascade and pane cleanup stay the host's.
import { useCallback, useMemo } from "react";
import {
  experimental_useThreadActions,
  useBbNavigate,
  useSdk,
  type PluginBoundThreadAction,
  type PluginSidebarThread,
  type PluginThreadActionTarget,
} from "@get-bb/plugin-sdk/app";

export interface ThreadMutations {
  open(threadId: string, options?: { split?: boolean }): void;
  openNewThread(options?: { projectId?: string; focusPrompt?: boolean }): void;
  setPinned(threadId: string, pinned: boolean): Promise<void>;
  setRead(threadId: string, read: boolean): Promise<void>;
  /** Silent rename, for inline editing in the row. */
  rename(threadId: string, title: string): Promise<void>;
  regenerateTitle(threadId: string): Promise<void>;
}

/** Navigation and silent thread writes, stable for a component's lifetime. */
export function useThreadMutations(): ThreadMutations {
  const navigate = useBbNavigate();
  const sdk = useSdk();
  return useMemo(
    () => ({
      open: (threadId, options) => navigate.toThread(threadId, options),
      openNewThread: (options) => navigate.toCompose(options),
      setPinned: async (threadId, pinned) => {
        await (pinned
          ? sdk.threads.pin({ threadId })
          : sdk.threads.unpin({ threadId }));
      },
      setRead: async (threadId, read) => {
        await (read
          ? sdk.threads.markRead({ threadId })
          : sdk.threads.markUnread({ threadId }));
      },
      rename: async (threadId, title) => {
        await sdk.threads.update({ threadId, title });
      },
      regenerateTitle: async (threadId) => {
        await sdk.threads.experimental_regenerateTitle({ threadId });
      },
    }),
    [navigate, sdk],
  );
}

/** The thread fields bb's own thread actions read, from one sidebar row. */
export function threadActionTarget(
  thread: PluginSidebarThread,
): PluginThreadActionTarget {
  const environment = thread.environment;
  return {
    id: thread.id,
    projectId: thread.projectId,
    parentThreadId: thread.parentThreadId,
    parentNotifications: thread.parentNotifications,
    archivedAt: thread.archivedAt,
    pinnedAt: thread.pinnedAt,
    sectionId: thread.sectionId,
    isUnread: thread.isUnread,
    status: thread.status,
    environment:
      environment?.id === null || environment?.id === undefined
        ? null
        : { id: environment.id, path: environment.path },
  };
}

/**
 * One of bb's own thread actions (`bb--core/archive`, `bb--core/delete`) bound
 * to this row: the same confirmations, child cascade and pane cleanup bb's
 * list gets. Null when bb no longer contributes that action.
 */
export function useCoreThreadAction(
  thread: PluginSidebarThread,
  id: "archive" | "delete",
): PluginBoundThreadAction | null {
  const entries = experimental_useThreadActions(threadActionTarget(thread));
  return entries.find((entry) => entry.key === `bb--core/${id}`)?.action ?? null;
}

/**
 * Archive one row the way bb's own list does: through bb's archive action, so
 * the child cascade, confirmation and pane cleanup stay the host's. Falls back
 * to a plain archive when bb stops contributing the action.
 */
export function useArchiveThread(thread: PluginSidebarThread): () => void {
  const archive = useCoreThreadAction(thread, "archive");
  const sdk = useSdk();
  return useCallback(() => {
    if (archive !== null) {
      void archive.run();
      return;
    }
    void sdk.threads.archive({ threadId: thread.id });
  }, [archive, sdk, thread.id]);
}
