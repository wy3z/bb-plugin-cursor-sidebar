import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginRpcResult } from "@get-bb/plugin-sdk/app";
import type { projectSidebarRpcContract } from "./server";
import {
  EMPTY_OWNERSHIP,
  type CoreOwnership,
  type ExecutionObservation,
} from "./core-ownership";

type Managers = PluginRpcResult<typeof projectSidebarRpcContract.listManagers>;

export interface ManagersState extends Managers {
  /**
   * The last verified Core ownership snapshot. When the read later fails the
   * snapshot is retained and `ownershipObservation` becomes "stale"; no
   * association row is ever used to fill an owned home.
   */
  ownership: CoreOwnership;
  ownershipObservation: ExecutionObservation;
  /** True only while the verified ownership read is current. */
  ownershipCurrent: boolean;
  /** Refreshes the manager projection and the verified ownership read. */
  refresh: () => Promise<void>;
}

export function useManagers(threadIds: string): ManagersState {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const connection = useRealtimeConnectionState();
  const [data, setData] = useState<Managers>({ available: false, membershipAvailable: false, projects: [], workers: [], memberships: [] });
  const [ownership, setOwnership] = useState<CoreOwnership>(EMPTY_OWNERSHIP);
  const [ownershipObservation, setOwnershipObservation] =
    useState<ExecutionObservation>("unknown");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const result = await rpc.call("listManagers", {});
      let nextOwnership: CoreOwnership | null = null;
      try {
        const read = await rpc.call("coreOwnership", {});
        // An older manager omits the source/target identity; normalize to an
        // explicit null so the index never reads `undefined` as a Core id.
        nextOwnership = {
          ...read,
          transfers: read.transfers.map((transfer) => ({
            ...transfer,
            sourceOwnerProjectId: transfer.sourceOwnerProjectId ?? null,
            targetProjectId: transfer.targetProjectId ?? null,
          })),
        };
      } catch {
        // Older manager without the verified ownership read, or a transient
        // failure: keep the last verified snapshot and mark it stale. Nothing
        // is ever inferred from recorded associations.
      }
      if (sequence.current !== id) return;
      setData(result);
      if (nextOwnership !== null) {
        setOwnership(nextOwnership);
        setOwnershipObservation("current-read");
      } else {
        setOwnershipObservation((previous) =>
          previous === "current-read" ? "stale" : previous,
        );
      }
    } catch {
      // The manager projection failed outright. Drop every exact acceptance
      // claim (review is only shown from a current read) while retaining the
      // last verified ownership snapshot explicitly stale.
      if (sequence.current !== id) return;
      setData((previous) => ({
        ...previous,
        membershipAvailable: false,
        workers: previous.workers.map((worker) => ({ ...worker, reviewRequired: false })),
      }));
      setOwnershipObservation((previous) =>
        previous === "current-read" ? "stale" : previous,
      );
    }
  }, [rpc]);
  useEffect(() => {
    void refresh();
    return () => { sequence.current++; };
  }, [refresh, connection, threadIds]);
  useRealtime("managers", () => { void refresh(); });
  return {
    ...data,
    ownership,
    ownershipObservation,
    ownershipCurrent: ownershipObservation === "current-read",
    refresh,
  };
}
