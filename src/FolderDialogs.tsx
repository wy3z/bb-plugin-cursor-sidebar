import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ThreadSectionInfo } from "./useThreadSections";

/** Rename one folder. The chats inside keep their places. */
export function FolderNameDialog({ folder, onClose, onRename }: {
  folder: ThreadSectionInfo;
  onClose(): void;
  onRename(name: string): Promise<boolean>;
}) {
  const [name, setName] = useState(folder.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="ps-move-dialog">
      <DialogHeader><DialogTitle>Rename folder</DialogTitle>
        <DialogDescription>Renaming “{folder.name}” changes the label only.</DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-2 text-sm">Name
        <input aria-label="Folder name" maxLength={200}
          className="rounded border border-border bg-background p-2" value={name} disabled={busy}
          onChange={(event) => setName(event.target.value)} />
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          disabled={busy || !name.trim() || name.trim() === folder.name}
          onClick={async () => {
            setBusy(true); setError(null);
            try {
              const ok = await onRename(name.trim());
              if (ok) onClose();
              else setError("The rename did not apply.");
            } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
            finally { setBusy(false); }
          }}>{busy ? "Renaming…" : "Rename folder"}</button>
      </div>
    </DialogContent>
  </Dialog>;
}

/** Delete one folder. Its chats return to the dated groups; pins are kept. */
export function DeleteFolderDialog({ folder, chatCount, onClose, onDelete }: {
  folder: ThreadSectionInfo;
  chatCount: number;
  onClose(): void;
  onDelete(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="ps-move-dialog">
      <DialogHeader><DialogTitle>Delete folder</DialogTitle>
        <DialogDescription>Delete “{folder.name}”? {chatCount === 0
          ? "It holds no standalone chats."
          : `${chatCount} chat${chatCount === 1 ? "" : "s"} return${chatCount === 1 ? "s" : ""} to the dated chats.`} Pinned chats stay pinned. No chat is archived or deleted.</DialogDescription>
      </DialogHeader>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="rounded bg-destructive px-3 py-2 text-sm text-destructive-foreground" disabled={busy}
          onClick={async () => {
            setBusy(true); setError(null);
            try { await onDelete(); onClose(); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
            finally { setBusy(false); }
          }}>{busy ? "Deleting…" : "Delete folder"}</button>
      </div>
    </DialogContent>
  </Dialog>;
}
