import { useEffect, useState } from "react";
import { useRpc, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { threadDisplayTitle } from "./inbox";
import type { ManagedProject } from "./membership";
import type { projectSidebarRpcContract } from "./server";

type AssociationMode = "handover" | "reference";

/**
 * Add an existing chat to a managed project.
 *
 * "Hand over to Project Manager" associates the family, persists a
 * deduplicated handover request and notifies that project's Project Manager to
 * inspect the conversation. "Add as reference only" associates silently: no
 * request, no notification and no work is started. Neither rewrites the source
 * chat's history, environment or native parentage.
 */
export function AssociateToProjectDialog({ thread, projects, initialProjectId, initialMode, onClose, onDone }: {
  thread: PluginSidebarThread;
  projects: readonly ManagedProject[];
  initialProjectId?: string | null;
  /** The action the user chose decides the default; reference starts silent. */
  initialMode?: AssociationMode;
  onClose(): void;
  onDone(message: string): void;
}) {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const withManagers = projects.filter((project) => project.coordinatorThreadId);
  const [destination, setDestination] = useState(() => initialProjectId ?? withManagers[0]?.id ?? "");
  const [mode, setMode] = useState<AssociationMode>(() => initialMode ?? "handover");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{
    status: "awaiting_manager" | "reviewed";
    notifyState: "pending" | "sending" | "sent" | "uncertain";
  } | null>(null);

  useEffect(() => {
    if (!destination) {
      setExisting(null);
      return;
    }
    let cancelled = false;
    void rpc
      .call("listHandoverRequests", { projectId: destination })
      .then((result) => {
        if (cancelled) return;
        const match = result.requests.find(
          (request) => request.sourceRootThreadId === thread.id || request.sourceThreadId === thread.id,
        );
        setExisting(match ? { status: match.status, notifyState: match.notifyState ?? (match.notified ? "sent" : "pending") } : null);
      })
      .catch(() => {
        if (!cancelled) setExisting(null);
      });
    return () => {
      cancelled = true;
    };
  }, [destination, rpc, thread.id]);

  async function submit() {
    if (busy) return;
    if (!destination) {
      setError("Choose a project to add this chat to.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "reference") {
        await rpc.call("addCoreReference", { threadId: thread.id, projectId: destination });
        const projectName = withManagers.find((project) => project.id === destination)?.name ?? "the Core";
        onDone(`Added to ${projectName} as reference only. Its home and parent are unchanged, and nothing was started.`);
        onClose();
        return;
      }
      const result = await rpc.call("startProjectFromThread", {
        threadId: thread.id,
        projectId: destination,
        mode,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const projectName = result.project.name;
      onDone(`Handed over to ${projectName}. Its Core will review the chat.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const title = threadDisplayTitle(thread);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="ps-create-dialog">
        <DialogHeader>
          <DialogTitle>Add “{title}” to a Core</DialogTitle>
          <DialogDescription>
            Hand this chat and its existing family to a Core, or record a non-owning reference. Handing over records a
            bounded request and leaves history, environment and native parentage in place; a reference-only link moves
            nothing and starts nothing.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-2 text-sm">
          Core
          <select
            aria-label="Destination Core"
            className="rounded border border-border bg-background p-2"
            disabled={busy}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            {withManagers.length === 0 ? <option value="">No Cores yet</option> : null}
            {withManagers.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-2 text-sm" disabled={busy}>
          <legend className="mb-1">Mode</legend>
          <label className="flex items-start gap-2">
            <input
              checked={mode === "handover"}
              className="mt-1"
              name="association-mode"
              type="radio"
              onChange={() => setMode("handover")}
            />
            <span>
              <span className="block">Hand over to Core</span>
              <span className="block text-xs text-muted-foreground">
                Sends the Core a bounded, deduplicated request to inspect this chat and decide next steps.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              checked={mode === "reference"}
              className="mt-1"
              name="association-mode"
              type="radio"
              onChange={() => setMode("reference")}
            />
            <span>
              <span className="block">Add as reference only</span>
              <span className="block text-xs text-muted-foreground">
                Records a durable, non-owning link. Nothing moves, no request is sent and no work is started; the chat
                keeps its home.
              </span>
            </span>
          </label>
        </fieldset>
        {mode === "handover" ? (
          <label className="flex flex-col gap-2 text-sm">
            Optional note for the Core
            <textarea
              aria-label="Optional note for the Core"
              className="min-h-16 rounded border border-border bg-background p-2"
              disabled={busy}
              maxLength={2_000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. This is the branch I want continued; the rest is background."
              value={note}
            />
          </label>
        ) : null}
        {existing ? (
          <p role="status" className="text-xs text-muted-foreground">
            {existing.status === "reviewed"
              ? "The Core has already reviewed a handover for this chat."
              : existing.notifyState === "sent"
                ? "A handover for this chat is awaiting the Core."
                : existing.notifyState === "sending"
                  ? "The notification for this chat's handover has been claimed and is in progress."
                  : existing.notifyState === "uncertain"
                    ? "A handover is recorded, but its notification outcome is unknown and will not be retried automatically."
                    : "A handover for this chat is recorded and awaiting notification."}
          </p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
            disabled={busy || !destination}
            onClick={() => { void submit(); }}
          >
            {busy ? "Adding…" : mode === "handover" ? "Hand over" : "Add as reference"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
