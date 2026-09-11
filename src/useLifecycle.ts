import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { projectSidebarRpcContract } from "./server";
import {
  canPark,
  resolveShelf,
  type ThreadLifecycleRow,
  type ThreadShelf,
} from "./lifecycle";

/**
 * Any live work at all, which blocks parking and wakes a parked thread.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */
export function isWorking(thread: PluginSidebarThread): boolean {
  const { activity } = thread;
  return (
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0 ||
    thread.indicator === "runtime" ||
    thread.indicator === "working-draft"
  );
}

export type LifecycleAction = "settle" | "unsettle";

export interface LifecycleApi {
  shelfFor(
    thread: PluginSidebarThread,
    descendants?: readonly PluginSidebarThread[],
  ): ThreadShelf;
  canPark(
    thread: PluginSidebarThread,
    descendants?: readonly PluginSidebarThread[],
  ): boolean;
  settle(threadId: string): Promise<void>;
  unsettle(threadId: string): Promise<void>;
}

export interface LifecycleState {
  /** Honest load state: never hide a failed store behind an empty list. */
  status: "loading" | "ready" | "error";
  /** The last mutation failure, cleared by the next success. */
  error: string | null;
  api: LifecycleApi;
  /** Whether one action is in flight for one thread. */
  isPending: (threadId: string, action: LifecycleAction) => boolean;
  retry: () => void;
  dismissError: () => void;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Reads the plugin's own settled store and classifies threads onto shelves.
 *
 * Every mutation is centralized: it is suppressed while the same action is
 * already in flight for that thread, it refuses to run before the store has
 * loaded, it refreshes from the server on success instead of trusting the
 * realtime echo, and it reports failure through a toast so the caller never
 * has to swallow a rejected promise.
 */
export function useLifecycle(): LifecycleState {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const realtimeState = useRealtimeConnectionState();
  const [rows, setRows] = useState<ReadonlyMap<string, ThreadLifecycleRow>>(
    () => new Map(),
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef<Set<string>>(new Set());
  const [, setPendingVersion] = useState(0);
  const bumpPending = useCallback(() => {
    setPendingVersion((version) => version + 1);
  }, []);

  // Responses can land out of order (a mutation's refresh racing a realtime
  // one), and an older list would silently restore state the user just
  // changed. Only the newest request may write.
  const requestSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await rpc.call("listLifecycle", {});
      if (seq !== requestSeq.current) return;
      setRows(new Map(result.rows.map((row) => [row.threadId, row])));
      setStatus("ready");
    } catch {
      if (seq !== requestSeq.current) return;
      // Drop the stale rows so the display and the copy agree: with no store
      // every thread really is active, and the banner is true.
      setRows(new Map());
      setStatus("error");
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh, realtimeState]);

  useRealtime("lifecycle", () => {
    void refresh();
  });

  const statusRef = useRef(status);
  statusRef.current = status;

  const runMutation = useCallback(
    async (threadId: string, action: LifecycleAction, work: () => Promise<unknown>) => {
      if (statusRef.current !== "ready") return;
      const key = `${threadId}:${action}`;
      if (pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      bumpPending();
      try {
        await work();
        await refresh();
        setError(null);
      } catch (cause) {
        const message = messageOf(cause);
        setError(message);
        toast.error("Could not update thread", { description: message });
      } finally {
        pendingRef.current.delete(key);
        bumpPending();
      }
    },
    [bumpPending, refresh],
  );

  const api = useMemo<LifecycleApi>(() => {
    const signalsFor = (
      thread: PluginSidebarThread,
      descendants: readonly PluginSidebarThread[] = [],
    ) => {
      const group = [thread, ...descendants];
      return {
        hasPendingInteraction: group.some(
          (candidate) => candidate.hasPendingInteraction,
        ),
        isWorking: group.some(isWorking),
        latestAttentionAt: Math.max(
          ...group.map((candidate) => candidate.latestAttentionAt),
        ),
      };
    };
    return {
      shelfFor: (thread, descendants = []) =>
        resolveShelf(rows.get(thread.id), signalsFor(thread, descendants)),
      canPark: (thread, descendants = []) =>
        canPark(signalsFor(thread, descendants)),
      settle: (threadId) =>
        runMutation(threadId, "settle", () =>
          rpc.call("settle", { threadId }),
        ),
      unsettle: (threadId) =>
        runMutation(threadId, "unsettle", () =>
          rpc.call("unsettle", { threadId }),
        ),
    };
  }, [rows, rpc, runMutation]);

  const isPending = useCallback(
    (threadId: string, action: LifecycleAction) =>
      pendingRef.current.has(`${threadId}:${action}`),
    [],
  );

  const retry = useCallback(() => {
    void refresh();
  }, [refresh]);

  const dismissError = useCallback(() => setError(null), []);

  return { status, error, api, isPending, retry, dismissError };
}
