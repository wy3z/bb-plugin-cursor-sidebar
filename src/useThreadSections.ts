import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { THREAD_SECTIONS_CHANNEL } from "./channels";
import type { cursorSidebarRpcContract } from "./server";

export interface ThreadSectionInfo {
  id: string;
  name: string;
}

export interface ThreadSectionsStore {
  sections: readonly ThreadSectionInfo[];
  refresh: () => Promise<void>;
  rename: (id: string, name: string) => Promise<boolean>;
  remove: (id: string) => Promise<number | null>;
  /**
   * File or unfile one display family with native section state. Returns the
   * ids the host rejected; the sidebar never caches assignments, so native
   * state stays the single source of truth. Callers report failures in their
   * own surface (dialog error, drag toast), so this stays quiet.
   */
  setFamily: (threadIds: readonly string[], sectionId: string | null) => Promise<string[]>;
}

/**
 * BB's native named sections as standalone folders. The registry is the only
 * client state; assignments live on the threads themselves and arrive through
 * the host's sidebar feed. Registry renames and deletes apply optimistically
 * with rollback; assignment writes await the host and report failures.
 */
export function useThreadSections(): ThreadSectionsStore {
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
  const realtimeState = useRealtimeConnectionState();
  const [sections, setSections] = useState<readonly ThreadSectionInfo[]>([]);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await rpc.call("listThreadSections", {});
      if (seq !== requestSeq.current) return;
      setSections(result.sections);
    } catch {
      // Keep the last known folders; pins, recency and reorder still work on
      // the native feed alone.
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh, realtimeState]);

  // Cross-client registry updates arrive here; the backend publishes whenever
  // native sections may have changed. Pin and assignment state rides the
  // host's own sidebar feed. The hook owns the subscription lifetime.
  useRealtime(THREAD_SECTIONS_CHANNEL, () => {
    void refresh();
  });

  const rename = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const previousName = sections.find((section) => section.id === id)?.name ?? null;
      setSections((current) =>
        current.map((section) => (section.id === id ? { ...section, name: trimmed } : section)),
      );
      try {
        const result = await rpc.call("renameThreadSection", { id, name: trimmed });
        setSections((current) =>
          current.map((section) => (section.id === id ? result.section : section)),
        );
        return true;
      } catch (cause) {
        // Restore only this row, so a concurrent refresh is not rolled back.
        if (previousName !== null) {
          setSections((current) =>
            current.map((section) =>
              section.id === id ? { ...section, name: previousName } : section,
            ),
          );
        }
        toast.error("Could not rename the folder", {
          description: cause instanceof Error ? cause.message : String(cause),
        });
        return false;
      }
    },
    [rpc, sections],
  );

  const remove = useCallback(
    async (id: string) => {
      const previous = sections.find((section) => section.id === id);
      setSections((current) => current.filter((section) => section.id !== id));
      try {
        const result = await rpc.call("deleteThreadSection", { id });
        await refresh();
        return result.updatedThreadCount;
      } catch (cause) {
        if (previous !== undefined) {
          setSections((current) =>
            current.some((section) => section.id === id) ? current : [...current, previous],
          );
        }
        toast.error("Could not delete the folder", {
          description: cause instanceof Error ? cause.message : String(cause),
        });
        return null;
      }
    },
    [refresh, rpc, sections],
  );

  const setFamily = useCallback(
    async (threadIds: readonly string[], sectionId: string | null) => {
      try {
        const result = await rpc.call("setThreadSection", {
          threadIds: [...threadIds],
          sectionId,
        });
        return result.failed;
      } catch (cause) {
        // The whole move was refused: every id counts as failed and the
        // caller reports it.
        return [...threadIds];
      }
    },
    [rpc],
  );

  return useMemo(
    () => ({ sections, refresh, rename, remove, setFamily }),
    [refresh, remove, rename, sections, setFamily],
  );
}
