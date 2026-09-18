import { useEffect, useMemo, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { cursorSidebarRpcContract } from "./server";
import { SIDEBAR_VIEW_CHANNEL } from "./server";
import type { SidebarViewStore } from "./sidebar-view";
import { createSidebarViewController } from "./sidebar-view-controller";

/**
 * The shared persisted SidebarView. It rides the plugin database the visibility
 * list already uses, so grouping, ordering, Show and filters travel between the
 * user's clients. All ordering, coalescing and recovery lives in the one
 * controller, so this hook stays a subscription over it.
 */
export function useSidebarView(): SidebarViewStore {
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
  const connection = useRealtimeConnectionState();
  const [, setVersion] = useState(0);
  const controller = useMemo(
    () =>
      createSidebarViewController({
        read: async () => (await rpc.call("sidebarView", {})).view,
        write: async (view) => {
          await rpc.call("setSidebarView", { view });
        },
      }),
    [rpc],
  );

  useEffect(() => controller.subscribe(() => setVersion((value) => value + 1)), [controller]);
  useEffect(() => {
    void controller.load();
  }, [controller, connection]);
  useRealtime(SIDEBAR_VIEW_CHANNEL, () => {
    void controller.load();
  });

  return {
    view: controller.getView(),
    update: controller.update,
    sync: controller.getSync(),
    retry: controller.retry,
  };
}
