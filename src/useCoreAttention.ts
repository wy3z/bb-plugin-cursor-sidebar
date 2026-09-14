import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { projectSidebarRpcContract } from "./server";
import {
  EMPTY_CORE_EXACT_FACTS,
  type CoreAttentionAuthority,
  type CoreExactFacts,
} from "./status";
import { projectCurrentAttention } from "./attention-projection";
import type { ExecutionObservation } from "./core-ownership";
import {
  summarizeListeningHealth,
  type ListeningHealth,
} from "./listening-health";
import { nativeAttentionSignature } from "./attention-signal";

export { nativeAttentionSignature } from "./attention-signal";

/** Real native subscription health for one Core, or null when unreadable. */
export type CoreListeningHealth = ListeningHealth;

export interface CoreAttentionState extends CoreExactFacts {
  /** The manager's listening count, or null when the attention read failed. */
  listening: number | null;
  /** Native subscription health; null when the projection failed. */
  health: CoreListeningHealth | null;
  /** Handovers still awaiting this Core, or null when the read failed. */
  handoversAwaiting: number | null;
}

const UNKNOWN: CoreAttentionState = {
  ...EMPTY_CORE_EXACT_FACTS,
  listening: null,
  health: null,
  handoversAwaiting: null,
};

const OBSERVATION_ORDER: Record<ExecutionObservation, number> = {
  "current-read": 0,
  stale: 1,
  unknown: 2,
};

/**
 * Bounded per-Core reads for the sidebar's Core summaries, deduplicated by run
 * so a burst of feed updates triggers at most one in-flight read per Core. Each
 * Core is read through three existing manager projections: exact-generation
 * attention, native subscription health and pending handovers. Concurrency is
 * capped so a large fleet never fans out all at once. Refresh rides the native
 * sidebar feed signature, the manager's own `managers` channel and connection
 * changes, never a timer.
 */
export function useCoreAttention(
  coreIds: readonly string[],
  refreshKey: string,
): ReadonlyMap<string, CoreAttentionState> {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const connection = useRealtimeConnectionState();
  const [states, setStates] = useState<ReadonlyMap<string, CoreAttentionState>>(new Map());
  const [revision, setRevision] = useState(0);
  const runId = useRef(0);
  const idsRef = useRef<string>("");
  idsRef.current = coreIds.join("\u0000");

  // The manager publishes its projection changes on the sidebar's own channel;
  // the connection transition is handled below for missed ephemeral signals.
  useRealtime("managers", useCallback(() => setRevision((value) => value + 1), []));

  useEffect(() => {
    const ids = idsRef.current === "" ? [] : idsRef.current.split("\u0000");
    if (ids.length === 0) {
      setStates(new Map());
      return;
    }
    const id = ++runId.current;
    const next = new Map<string, CoreAttentionState>();
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) {
        const coreId = ids[cursor++]!;
        next.set(coreId, await readCore(coreId));
      }
    };
    const concurrency = Math.min(3, ids.length);
    void Promise.all(Array.from({ length: concurrency }, () => worker())).then(() => {
      if (runId.current === id) setStates(next);
    });

    async function readCore(coreId: string): Promise<CoreAttentionState> {
      const [attention, health, handovers] = await Promise.allSettled([
        rpc.call("coreAttention", { projectId: coreId }),
        rpc.call("coreListeningHealth", { projectId: coreId }),
        rpc.call("listHandoverRequests", { projectId: coreId }),
      ]);
      let observation: ExecutionObservation = "unknown";
      let listening: number | null = null;
      const reviewThreadIds = new Set<string>();
      const failedThreadIds = new Set<string>();
      const queuedThreadIds = new Set<string>();
      let authority: CoreAttentionAuthority | undefined;
      if (attention.status === "fulfilled") {
        const value = attention.value;
        observation = value.observation ?? "unknown";
        listening = value.listening;
        if (observation === "current-read") {
          // Only a current observation may present an exact generation as the
          // live review, failure or queue fact. A stale read keeps the numbers
          // out of the current status rather than showing prior history.
          const projected = projectCurrentAttention(value.attention, value.open);
          for (const id of projected.reviewThreadIds) reviewThreadIds.add(id);
          for (const id of projected.failedThreadIds) failedThreadIds.add(id);
          for (const id of projected.queuedThreadIds) queuedThreadIds.add(id);
          authority = {
            entries: projected.entries,
            counts: {
              forReview: value.counts.forReview,
              failed: value.counts.failed,
              needsYou: value.counts.needsYou,
            },
            hasMore: value.hasMore,
          };
        }
      }
      let healthFacts: CoreListeningHealth | null = null;
      if (health.status === "fulfilled" && health.value.available) {
        healthFacts = summarizeListeningHealth(
          health.value.subscriptions.map((subscription) => ({
            state: subscription.state,
            enabled: subscription.enabled,
          })),
        );
      }
      const handoversAwaiting = handovers.status === "fulfilled"
        ? handovers.value.requests.filter((request) => request.status === "awaiting_manager").length
        : null;
      return {
        observation,
        reviewThreadIds,
        failedThreadIds,
        queuedThreadIds,
        attention: authority,
        listening,
        health: healthFacts,
        handoversAwaiting,
      };
    }
  }, [rpc, connection, revision, refreshKey]);

  return states;
}

/** Worst observation across the Cores, for a single sidebar freshness marker. */
export function worstObservation(
  states: ReadonlyMap<string, CoreAttentionState>,
): ExecutionObservation | null {
  let worst: ExecutionObservation | null = null;
  for (const state of states.values()) {
    if (worst === null || OBSERVATION_ORDER[state.observation] > OBSERVATION_ORDER[worst]) {
      worst = state.observation;
    }
  }
  return worst;
}
