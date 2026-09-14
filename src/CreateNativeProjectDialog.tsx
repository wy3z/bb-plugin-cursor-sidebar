import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { projectSidebarRpcContract } from "./server";
import { derivedProjectName } from "./project-name";

/**
 * Create a directory-backed native BB Project. This creates no Core and
 * attaches nothing managed: the new Project is an ordinary container for
 * threads, shown under Projects.
 *
 * The name is not user-editable. The manager's directory resolver derives it
 * from the folder and reuses an existing same host+path Project, so a typed
 * name could only be discarded or rename a reused Project. The dialog shows the
 * derived name instead and says plainly that an existing folder is reused.
 */
export function CreateNativeProjectDialog({ onClose, onCreated }: {
  onClose(): void;
  onCreated(project: { id: string; name: string }): void;
}) {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const [hosts, setHosts] = useState<{ id: string; name: string; status: string }[]>([]);
  const [hostId, setHostId] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc
      .call("listHosts", {})
      .then((result) => {
        if (cancelled) return;
        const connected = result.hosts.filter((host) => host.status === "connected");
        setHosts(result.hosts);
        setHostId((current) => current || connected[0]?.id || result.hosts[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setHosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  async function browse() {
    if (!hostId) return;
    try {
      const result = await rpc.call("pickFolder", { hostId });
      if (result.path) setPath(result.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function submit() {
    if (busy) return;
    const trimmedPath = path.trim();
    if (!hostId || !trimmedPath) {
      setError("Choose a host and a working directory.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const project = await rpc.call("createNativeProject", { hostId, path: trimmedPath });
      if (!project.id) throw new Error("The Project was not created.");
      onCreated(project);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const derivedName = derivedProjectName(path);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="ps-create-dialog">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Creates a directory-backed BB Project for ordinary chats. It starts no Core and attaches nothing managed.
            A folder that already backs a Project is reused, and its existing name is kept.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-2 text-sm">
          Host
          <select
            aria-label="Host"
            className="rounded border border-border bg-background p-2"
            disabled={busy || hosts.length === 0}
            value={hostId}
            onChange={(event) => setHostId(event.target.value)}
          >
            {hosts.length === 0 ? <option value="">No hosts available</option> : null}
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>{host.name}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-2 text-sm">
          Working directory
          <div className="flex gap-2">
            <input
              aria-label="Working directory"
              className="min-w-0 flex-1 rounded border border-border bg-background p-2"
              disabled={busy}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/home/you/projects/example"
              value={path}
            />
            <button
              type="button"
              className="rounded border border-border px-3 py-2 text-sm"
              disabled={busy || !hostId}
              onClick={() => { void browse(); }}
            >
              Browse…
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Project name: <span className="text-foreground">{derivedName || "the folder name"}</span>
          <span className="block text-xs">Derived from the folder. An existing Project for this path keeps its name.</span>
        </p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
            disabled={busy || !hostId || !path.trim()}
            onClick={() => { void submit(); }}
          >
            {busy ? "Creating…" : "Create Project"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
