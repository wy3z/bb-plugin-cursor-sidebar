import { useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ManagedProject } from "./membership";

export function MoveToProjectDialog({ thread, projects, currentProjectId, onClose, onMove }: {
  thread: PluginSidebarThread; projects: readonly ManagedProject[]; currentProjectId: string | null;
  onClose(): void; onMove(projectId: string | null): Promise<void>;
}) {
  const [destination, setDestination] = useState(currentProjectId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="ps-move-dialog">
      <DialogHeader><DialogTitle>Move to Core</DialogTitle>
        <DialogDescription>Move “{thread.title ?? thread.titleFallback ?? "Untitled chat"}” and its entire existing family to a Core. The family root becomes a real child of that Core and appears directly beneath it. Transcript, workspace, branch, environment and ongoing work stay in place. Moving starts no work.</DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-2 text-sm">Destination
        <select aria-label="Destination Core" className="rounded border border-border bg-background p-2" value={destination} disabled={busy} onChange={(event) => setDestination(event.target.value)}>
          {projects.filter((project) => project.coordinatorThreadId).length === 0 ? <option value="">No Cores available</option> : null}
          {projects.filter((project) => project.coordinatorThreadId).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" disabled={busy || !destination || destination === (currentProjectId ?? "")} onClick={async () => {
          setBusy(true); setError(null);
          try { await onMove(destination || null); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
        }}>{busy ? "Moving…" : "Move chat family"}</button>
      </div>
    </DialogContent>
  </Dialog>;
}
