import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Per-client layout state, kept in localStorage rather than the plugin
 * database: which projects the user folded and whether the global settled
 * section is open. Device layout stays separate from the shared, per-user
 * project visibility store (see useProjectVisibility), and neither touches a
 * thread's lifecycle.
 */
const PROJECT_COLLAPSED_KEY = "bb-plugin-project-sidebar:collapsed-projects:v2";
const SETTLED_OPEN_KEY = "bb-plugin-project-sidebar:open-settled:v3";
/** Legacy per-browser visibility list, migrated once into the shared store. */
export const HIDDEN_PROJECTS_KEY = "bb-plugin-project-sidebar:hidden-projects:v1";
export const EXPANDED_AGES_KEY = "bb-plugin-project-sidebar:expanded-ages:v1";
/** Pinned and folder groups default open; this set holds the collapsed ones. */
export const COLLAPSED_GROUPS_KEY = "bb-plugin-project-sidebar:collapsed-groups:v1";
/** Loose Threads under Projects grouping default collapsed; this set holds the open one. */
export const EXPANDED_THREADS_KEY = "bb-plugin-project-sidebar:expanded-threads:v1";

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
  /** Add and remove in one update, for a scoped bulk Expand/Collapse. */
  addMany: (ids: Iterable<string>) => void;
  removeMany: (ids: Iterable<string>) => void;
  /** Replace the whole set. */
  replace: (ids: Iterable<string>) => void;
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
  const replace = useCallback((values: Iterable<string>) => {
    setIds(new Set(values));
  }, []);
  const addMany = useCallback((values: Iterable<string>) => {
    setIds((current) => {
      const next = new Set(current);
      let changed = false;
      for (const value of values) {
        if (!next.has(value)) {
          next.add(value);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);
  const removeMany = useCallback((values: Iterable<string>) => {
    setIds((current) => {
      const next = new Set(current);
      let changed = false;
      for (const value of values) {
        if (next.delete(value)) changed = true;
      }
      return changed ? next : current;
    });
  }, []);

  return useMemo(
    () => ({ ids, toggle, add, remove, addMany, removeMany, replace }),
    [add, addMany, ids, remove, removeMany, replace, toggle],
  );
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
