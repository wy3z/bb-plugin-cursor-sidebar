import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ThreadSectionInfo } from "./useThreadSections";

interface LabeledThread {
  id: string;
  title: string | null;
  titleFallback: string | null;
}

function labelOf(thread: LabeledThread): string {
  return thread.title ?? thread.titleFallback ?? "Untitled chat";
}

/** Move one standalone family into a folder, out of it, or into a new one. */
export function MoveToFolderDialog({ thread, folders, currentFolderId, onClose, onMove }: {
  thread: LabeledThread;
  folders: readonly ThreadSectionInfo[];
  currentFolderId: string | null;
  onClose(): void;
  onMove(sectionId: string | null): Promise<void>;
}) {
  const [destination, setDestination] = useState(currentFolderId ?? "");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creating = newName.trim().length > 0;
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="ps-move-dialog">
      <DialogHeader><DialogTitle>Move family to folder</DialogTitle>
        <DialogDescription>Move “{labelOf(thread)}” and its replies into a folder, or out to the dated chats. The family root is unpinned so the move stays visible. Nothing is archived or deleted.</DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-2 text-sm">Folder
        <select aria-label="Destination folder" className="rounded border border-border bg-background p-2" value={destination} disabled={busy || creating} onChange={(event) => setDestination(event.target.value)}>
          <option value="">Dated chats (no folder)</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm">Or a new folder
        <input aria-label="New folder name" placeholder="Folder name" maxLength={200}
          className="rounded border border-border bg-background p-2" value={newName} disabled={busy}
          onChange={(event) => setNewName(event.target.value)} />
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          disabled={busy || (!creating && destination === (currentFolderId ?? "")) || (creating && !newName.trim())}
          onClick={async () => {
            setBusy(true); setError(null);
            try { await onMove(creating ? `new:${newName.trim()}` : destination || null); onClose(); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
            finally { setBusy(false); }
          }}>{busy ? "Moving…" : creating ? "Create and move" : "Move chat family"}</button>
      </div>
    </DialogContent>
  </Dialog>;
}

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
