import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Per-client UI state, kept in localStorage rather than the plugin database:
 * which projects the user folded, whether the global settled section is open,
 * and project visibility. It is view preference, not thread data, so it never
 * travels to the server and never touches a thread's lifecycle.
 */
const PROJECT_COLLAPSED_KEY = "bb-plugin-project-sidebar:collapsed-projects:v2";
const SETTLED_OPEN_KEY = "bb-plugin-project-sidebar:open-settled:v3";
export const HIDDEN_PROJECTS_KEY = "bb-plugin-project-sidebar:hidden-projects:v1";
export const EXPANDED_AGES_KEY = "bb-plugin-project-sidebar:expanded-ages:v1";

function loadIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function saveIds(key: string, ids: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Best-effort; the in-memory set still drives this render.
  }
}

export interface PersistentIds {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
}

/** A persisted set of ids with add/remove/toggle. */
export function usePersistentIds(storageKey = PROJECT_COLLAPSED_KEY): PersistentIds {
  const [ids, setIds] = useState<ReadonlySet<string>>(
    () => new Set(loadIds(storageKey)),
  );
  useEffect(() => {
    saveIds(storageKey, ids);
  }, [storageKey, ids]);

  const toggle = useCallback((id: string) => {
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const add = useCallback((id: string) => {
    setIds((current) => (current.has(id) ? current : new Set(current).add(id)));
  }, []);
  const remove = useCallback((id: string) => {
    setIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  return useMemo(() => ({ ids, toggle, add, remove }), [add, ids, remove, toggle]);
}

/** Projects default to open, so a project is open unless it is in the set. */
export function isProjectOpen(
  collapsedProjects: ReadonlySet<string>,
  projectId: string,
): boolean {
  return !collapsedProjects.has(projectId);
}

export interface PersistentSettledOpen {
  open: boolean;
  toggle: () => void;
  show: () => void;
}

/** The global settled section defaults to collapsed. */
export function usePersistentSettledOpen(): PersistentSettledOpen {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(SETTLED_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTLED_OPEN_KEY, open ? "1" : "0");
    } catch {
      // Best-effort; the in-memory flag still drives this render.
    }
  }, [open]);
  const toggle = useCallback(() => {
    setOpen((current) => !current);
  }, []);
  const show = useCallback(() => {
    setOpen(true);
  }, []);
  return useMemo(() => ({ open, show, toggle }), [open, show, toggle]);
}
