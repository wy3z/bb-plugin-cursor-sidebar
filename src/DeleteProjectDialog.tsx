import { useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { cursorSidebarRpcContract } from "./server";

/**
 * Delete a native BB Project. This is the real native delete: the project and
 * all of its threads go. The plugin's own order/visibility rows for it are
 * keyed by project existence elsewhere, so stale entries cannot linger.
 */
export function DeleteProjectDialog({ project, chatCount, onClose, onDeleted }: {
  project: { id: string; name: string };
  chatCount: number;
  onClose(): void;
  onDeleted(): void;
}) {
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            Delete “{project.name}” and {chatCount === 0 ? "its threads" : `all ${chatCount} of its chat${chatCount === 1 ? "" : "s"}`}? This deletes the BB project itself, not just its sidebar entry.
          </DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="rounded bg-destructive px-3 py-2 text-sm text-destructive-foreground"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  await rpc.call("deleteNativeProject", { projectId: project.id });
                  onDeleted();
                  onClose();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : String(cause));
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? "Deleting…" : "Delete project"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
