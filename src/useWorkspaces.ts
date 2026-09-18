import { useEffect, useMemo, useState } from "react";
import { useRpc, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { cursorSidebarRpcContract } from "./server";

export function useWorkspaces(threads: readonly PluginSidebarThread[]) {
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
  const key = [...new Set(threads.flatMap((thread) => thread.environment?.id ? [thread.environment.id] : []))].sort().join("\0");
  const [paths, setPaths] = useState<ReadonlyMap<string, string | null>>(new Map());
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const ids = key ? key.split("\0") : [];
      const next = new Map<string, string | null>();
      for (let index = 0; index < ids.length; index += 100) {
        const result = await rpc.call("listWorkspaces", { environmentIds: ids.slice(index, index + 100) });
        for (const env of result.workspaces) next.set(env.environmentId, env.path);
      }
      if (!disposed) setPaths(next);
    })().catch(() => { if (!disposed) setPaths(new Map()); });
    return () => { disposed = true; };
  }, [rpc, key]);
  return useMemo(() => paths, [paths]);
}
