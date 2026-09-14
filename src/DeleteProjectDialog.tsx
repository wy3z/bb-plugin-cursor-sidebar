import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Destructive confirmation for removing a managed Project. It only removes the
 * plugin's Project Manager association: chats, transcripts, workspaces and the
 * native BB project/working directory all stay.
 */
export function DeleteProjectDialog({ project, onClose, onDelete }: {
  project: { id: string; name: string };
  onClose(): void;
  onDelete(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="ps-delete-dialog">
        <DialogHeader>
          <DialogTitle>Delete Core?</DialogTitle>
          <DialogDescription>
            Delete the Core “{project.name}”. Its native conversation family, chats, transcripts, workspaces and
            worktrees are kept and appear under their native Project or Chats. The `.bb/exo` files and historical
            evidence are retained. The native BB project (working directory) is not deleted.
          </DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose className="rounded px-3 py-2 text-sm" disabled={busy}>Cancel</DialogClose>
          <button
            type="button"
            className="rounded bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-60"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onDelete();
                onClose();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete Core"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
