import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { cursorSidebarRpcContract } from "./server";

/**
 * The host bb itself runs on. A thread row only names its host when it differs,
 * so local work stays clean and remote work stays labelled. Null until known,
 * which the row treats as "unknown" and shows the label.
 */
export function usePrimaryHost(): string | null {
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
  const [hostId, setHostId] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    void rpc
      .call("primaryHost", {})
      .then((result) => {
        if (!disposed) setHostId(result.hostId);
      })
      .catch(() => {
        /* Leave the label visible when the host id cannot be resolved. */
      });
    return () => {
      disposed = true;
    };
  }, [rpc]);
  return hostId;
}
