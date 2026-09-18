import type { SidebarView } from "./server";
import {
  DEFAULT_SIDEBAR_VIEW,
  coerceSidebarView,
  type SidebarViewFailure,
  type SidebarViewSync,
} from "./sidebar-view";

/**
 * The one SidebarView write controller. It owns the optimistic view, the last
 * acknowledged server value, the pending write and the sync state, and it
 * serializes writes so a delayed earlier write can never land after a later
 * choice. The React hook is a thin subscription over it, so ordering, failure
 * and recovery behave the same in a fixture as in the app.
 */
export interface SidebarViewTransport {
  read: () => Promise<SidebarView | null>;
  write: (view: SidebarView) => Promise<void>;
}

export interface SidebarViewController {
  getView: () => SidebarView;
  /** The last server-acknowledged view, distinct from the optimistic view. */
  getAcknowledged: () => SidebarView | null;
  isAvailable: () => boolean;
  /** The relationship between the shown view and the shared acknowledged value. */
  getSync: () => SidebarViewSync;
  subscribe: (listener: () => void) => () => void;
  update: (patch: Partial<SidebarView>) => void;
  /** Re-attempt the unsaved change, or the failed read, once. */
  retry: () => void;
  /** Read the shared value; a pending local change stays on top of it. */
  load: () => Promise<void>;
}

export function createSidebarViewController(
  transport: SidebarViewTransport,
): SidebarViewController {
  let view: SidebarView = DEFAULT_SIDEBAR_VIEW;
  let acknowledged: SidebarView | null = null;
  let pending: SidebarView | null = null;
  let writing = false;
  let failure: SidebarViewFailure | null = null;
  let storeReadable = true;
  /**
   * The mutation boundary. A local choice and a write settlement each move it,
   * and a read records it when it starts. A read is only eligible to update the
   * acknowledged value while that boundary is unchanged, so an observation that
   * began before a settlement can never overwrite it. Generation alone is not
   * enough: a read can begin after the request and still resolve after the
   * settlement it was racing.
   */
  let mutationEpoch = 0;
  let readGeneration = 0;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const apply = (next: SidebarView): void => {
    view = next;
    notify();
  };
  const getSync = (): SidebarViewSync => {
    if (failure === "save") {
      return { kind: "unsaved", store: storeReadable ? "readable" : "unreadable" };
    }
    if (failure === "read") return { kind: "unreadable" };
    if (pending !== null || writing) return { kind: "saving" };
    return { kind: "synced" };
  };

  const load = async (): Promise<void> => {
    const generation = ++readGeneration;
    const epoch = mutationEpoch;
    try {
      const stored = await transport.read();
      if (generation !== readGeneration || epoch !== mutationEpoch) return;
      const serverView =
        stored === null ? DEFAULT_SIDEBAR_VIEW : coerceSidebarView(stored);
      acknowledged = serverView;
      storeReadable = true;
      if (failure === "read") failure = null;
      // A local change the server has not accepted stays on top of this read,
      // and a failed save keeps its place until it is written. A successful
      // recovery read proves the store is readable, not that the change saved.
      if (pending === null && !writing && failure !== "save") apply(serverView);
      else notify();
    } catch {
      if (generation !== readGeneration || epoch !== mutationEpoch) return;
      storeReadable = false;
      if (failure !== "save") failure = "read";
      notify();
    }
  };

  const flush = async (): Promise<void> => {
    if (writing) return;
    writing = true;
    try {
      while (pending !== null) {
        const target = pending;
        pending = null;
        try {
          await transport.write(target);
          acknowledged = target;
          storeReadable = true;
          failure = null;
          mutationEpoch += 1;
        } catch {
          failure = "save";
          mutationEpoch += 1;
          notify();
          // Re-read the shared truth only when no newer change is queued, so a
          // recovery read never clobbers an edit the user just made. It cannot
          // clear the failed save; only a later successful write can.
          if (pending === null) void load();
        }
      }
    } finally {
      writing = false;
      notify();
    }
  };

  const request = (next: SidebarView): void => {
    // Move the boundary so a read that started before this choice can never
    // overwrite it, and clear any prior failure for the new attempt.
    mutationEpoch += 1;
    failure = null;
    apply(next);
    pending = next;
    void flush();
  };

  return {
    getView: () => view,
    getAcknowledged: () => acknowledged,
    isAvailable: () => failure === null,
    getSync,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (patch) => {
      request({ ...view, ...patch });
    },
    retry: () => {
      if (failure === "save") {
        request(view);
        return;
      }
      void load();
    },
    load,
  };
}
