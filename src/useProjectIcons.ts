import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import { PROJECT_ICON_CHANNEL } from "./channels";
import type { cursorSidebarRpcContract } from "./server";
import { parseProjectIcon, serializeProjectIcon, type ProjectIcon } from "./project-icons";

export interface ProjectIcons {
  /** The chosen glyph or image for a native project, or null for the folder. */
  iconFor: (projectId: string) => ProjectIcon | null;
  /** Set or clear the icon; the write is optimistic and reloads on failure. */
  setIcon: (projectId: string, icon: ProjectIcon | null) => void;
}

/**
 * Project icons are a per-user overlay in the plugin database, keyed by the raw
 * native project id. BB's SDK has no icon field, so this is the only store; an
 * unknown or stale value falls back to unset rather than crashing the
 * heading. Writes are optimistic and reconcile against a reload on realtime or
 * a failed write.
 */
export function useProjectIcons(): ProjectIcons {
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
  const realtimeState = useRealtimeConnectionState();
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

  // A reconnect re-reads; realtime signals are not replayed, so an icon set
  // while the socket was down would otherwise stay stale.
  useEffect(() => {
    void load();
  }, [load, realtimeState]);
  useRealtime(PROJECT_ICON_CHANNEL, () => {
    void load();
  });

  const setIcon = useCallback((projectId: string, icon: ProjectIcon | null) => {
    const stored = icon === null ? null : serializeProjectIcon(icon);
    setIcons((current) => {
      const next = new Map(current);
      if (stored === null) next.delete(projectId);
      else next.set(projectId, stored);
      return next;
    });
    void rpc.call("setProjectIcon", { projectId, icon: stored }).catch(() => {
      // A lost write must not stick; re-read the shared truth.
      void load();
    });
  }, [rpc, load]);

  const iconFor = useCallback(
    (projectId: string): ProjectIcon | null => {
      const stored = icons.get(projectId);
      return stored === undefined ? null : parseProjectIcon(stored);
    },
    [icons],
  );

  return useMemo(() => ({ iconFor, setIcon }), [iconFor, setIcon]);
}
