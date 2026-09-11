import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { projectSidebarRpcContract } from "./server";

interface StoredOrder {
  ids: readonly string[];
  revision: number;
}

export interface ThreadOrderStore {
  /** The stored order for one sibling scope, or null when none is stored. */
  orderForScope: (scope: string) => readonly string[] | null;
  isPending: (scope: string) => boolean;
  /** Persist a whole sibling scope, returning whether the write applied. */
  reorder: (scope: string, nextIds: readonly string[]) => Promise<boolean>;
}

/**
 * The plugin-side order overlay for sibling thread groups. Order lives in the
 * plugin's database, never on a thread, so uninstalling removes it and no
 * native thread row is touched. Writes are compare-and-set on a per-scope
 * revision, and every write refreshes instead of trusting the realtime echo.
 */
export function useThreadOrders(): ThreadOrderStore {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const realtimeState = useRealtimeConnectionState();
  const [orders, setOrders] = useState<ReadonlyMap<string, StoredOrder>>(
    () => new Map(),
  );
  const pendingRef = useRef<Set<string>>(new Set());
  const [, setPendingVersion] = useState(0);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await rpc.call("listThreadOrders", {});
      if (seq !== requestSeq.current) return;
      setOrders(
        new Map(
          result.orders.map((order) => [
            order.scope,
            { ids: order.threadIds, revision: order.revision },
          ]),
        ),
      );
    } catch {
      // The list still renders in native order while the backend reloads.
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh, realtimeState]);

  useRealtime("thread-order", () => {
    void refresh();
  });

  const reorder = useCallback(
    async (scope: string, nextIds: readonly string[]) => {
      if (pendingRef.current.has(scope)) return false;
      const previous = orders.get(scope);
      const expectedRevision = previous?.revision ?? 0;
      // Invalidate reads that began before this write; the refresh below is
      // authoritative and supersedes any reconnect/realtime read.
      ++requestSeq.current;
      pendingRef.current.add(scope);
      setPendingVersion((version) => version + 1);
      setOrders((current) =>
        new Map(current).set(scope, { ids: [...nextIds], revision: expectedRevision }),
      );
      try {
        const result = await rpc.call("reorderThreads", {
          scope,
          threadIds: [...nextIds],
          expectedRevision,
        });
        setOrders((current) =>
          new Map(current).set(scope, {
            ids: result.threadIds,
            revision: result.revision,
          }),
        );
        await refresh();
        if (!result.applied) {
          toast.error("That order changed elsewhere", {
            description: "The list has been refreshed; try the move again.",
          });
        }
        return result.applied;
      } catch (cause) {
        setOrders((current) => {
          const next = new Map(current);
          if (previous === undefined) next.delete(scope);
          else next.set(scope, previous);
          return next;
        });
        toast.error("Could not save the new order", {
          description: cause instanceof Error ? cause.message : String(cause),
        });
        return false;
      } finally {
        pendingRef.current.delete(scope);
        setPendingVersion((version) => version + 1);
      }
    },
    [orders, refresh, rpc],
  );

  const orderForScope = useCallback(
    (scope: string) => orders.get(scope)?.ids ?? null,
    [orders],
  );
  const isPending = useCallback(
    (scope: string) => pendingRef.current.has(scope),
    [],
  );

  return useMemo(
    () => ({ orderForScope, isPending, reorder }),
    [isPending, orderForScope, reorder],
  );
}
