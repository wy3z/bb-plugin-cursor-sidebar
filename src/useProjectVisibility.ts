import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { projectSidebarRpcContract } from "./server";
import { VISIBILITY_CHANNEL } from "./server";
import { HIDDEN_PROJECTS_KEY } from "./collapse";

function loadLegacyIds(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_PROJECTS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function clearLegacyIds(): void {
  try {
    window.localStorage.removeItem(HIDDEN_PROJECTS_KEY);
  } catch {
    // Best-effort.
  }
}

export interface ProjectVisibility {
  ids: ReadonlySet<string>;
  add: (id: string) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
}

/**
 * Which projects the user chose to hide. This is shared per user through the
 * plugin database, not per browser, so hiding on one client hides on the
 * others. The old localStorage list is folded in once on upgrade; because
 * project existence stays authoritative in the Project Manager plugin, a stale
 * entry can never keep a deleted project visible.
 */
export function useProjectVisibility(): ProjectVisibility {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const [ids, setIds] = useState<ReadonlySet<string>>(
    () => new Set(loadLegacyIds()),
  );
  const migrated = useRef(false);

  const load = useCallback(async () => {
    try {
      const legacy = migrated.current ? [] : loadLegacyIds();
      const result = legacy.length > 0
        ? await rpc.call("mergeProjectVisibility", { hiddenIds: legacy })
        : await rpc.call("projectVisibility", {});
      migrated.current = true;
      if (legacy.length > 0) clearLegacyIds();
      setIds(new Set(result.hiddenIds));
    } catch {
      // Offline: retain the last known view rather than blanking the sidebar.
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(VISIBILITY_CHANNEL, () => {
    void load();
  });

  const setHidden = useCallback((id: string, hidden: boolean) => {
    setIds((current) => {
      if (hidden === current.has(id)) return current;
      const next = new Set(current);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });
    void rpc.call("setProjectVisibility", { projectId: id, hidden }).catch(() => {
      // A lost write must not stick; re-read the shared truth.
      void load();
    });
  }, [rpc, load]);

  const add = useCallback((id: string) => setHidden(id, true), [setHidden]);
  const remove = useCallback((id: string) => setHidden(id, false), [setHidden]);
  const toggle = useCallback((id: string) => {
    setIds((current) => {
      const hidden = !current.has(id);
      void rpc.call("setProjectVisibility", { projectId: id, hidden }).catch(() => {
        void load();
      });
      const next = new Set(current);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });
  }, [rpc, load]);

  return useMemo(() => ({ ids, add, remove, toggle }), [add, ids, remove, toggle]);
}
