import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { type IconName } from "@/components/ui/icon";
import type { projectSidebarRpcContract } from "./server";
import { PROJECT_ICON_CHANNEL } from "./server";
import { PROJECT_ICON_NAME_SET } from "./project-icons";

function isIconName(value: string): value is IconName {
  return PROJECT_ICON_NAME_SET.has(value);
}

export interface ProjectIcons {
  /** The chosen glyph for a native project, or null when it wears the folder. */
  iconFor: (projectId: string) => IconName | null;
  /** Set or clear the glyph; the write is optimistic and reloads on failure. */
  setIcon: (projectId: string, icon: IconName | null) => void;
}

/**
 * Project icons are a per-user overlay in the plugin database, keyed by the raw
 * native project id. BB's SDK has no icon field, so this is the only store; an
 * unknown or stale glyph name falls back to unset rather than crashing the
 * heading. Writes are optimistic and reconcile against a reload on realtime or
 * a failed write.
 */
export function useProjectIcons(): ProjectIcons {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const [icons, setIcons] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );

  const load = useCallback(async () => {
    try {
      const result = await rpc.call("listProjectIcons", {});
      setIcons(new Map(result.icons.map((row) => [row.projectId, row.icon])));
    } catch {
      // Offline: keep the last known icons rather than blanking the headings.
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(PROJECT_ICON_CHANNEL, () => {
    void load();
  });

  const setIcon = useCallback((projectId: string, icon: IconName | null) => {
    setIcons((current) => {
      const next = new Map(current);
      if (icon === null) next.delete(projectId);
      else next.set(projectId, icon);
      return next;
    });
    void rpc.call("setProjectIcon", { projectId, icon }).catch(() => {
      // A lost write must not stick; re-read the shared truth.
      void load();
    });
  }, [rpc, load]);

  const iconFor = useCallback(
    (projectId: string): IconName | null => {
      const stored = icons.get(projectId);
      if (stored === undefined || !isIconName(stored)) return null;
      return stored;
    },
    [icons],
  );

  return useMemo(() => ({ iconFor, setIcon }), [iconFor, setIcon]);
}
