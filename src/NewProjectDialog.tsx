import { useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TASKS_PLUGIN, tasksContract } from "./suite-contracts";

export function derivePrefix(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.map((word) => word[0]).join("") : (words[0] ?? "");
  const cleaned = raw.replace(/^[0-9]+/, "");
  return cleaned.slice(0, 10);
}

const PREFIX = /^[A-Z][A-Z0-9]{0,9}$/;

/** Create a tracker project and open the chat that will lead it. */
export function NewProjectDialog({ repos, onClose, onCreated }: {
  repos: readonly { id: string; name: string }[];
  onClose(): void;
  onCreated(project: { id: string; prefix: string; linkedBbProjectId: string | null }): void;
}) {
  const sdk = useSdk();
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [repo, setRepo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectivePrefix = prefixTouched ? prefix : derivePrefix(name);
  const valid = name.trim().length > 0 && PREFIX.test(effectivePrefix);
  const field = "rounded border border-border bg-background p-2";
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="cs-move-dialog">
      <DialogHeader><DialogTitle>New project</DialogTitle>
        <DialogDescription>A tracker project with a board. A new chat opens to lead it.</DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-2 text-sm">Name
        <input aria-label="Project name" maxLength={100} autoFocus className={field} value={name} disabled={busy}
          onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="flex flex-col gap-2 text-sm">Prefix
        <input aria-label="Task key prefix" maxLength={10} className={field} value={effectivePrefix} disabled={busy}
          onChange={(event) => { setPrefixTouched(true); setPrefix(event.target.value.toUpperCase()); }} />
      </label>
      <label className="flex flex-col gap-2 text-sm">Repository
        <select aria-label="Linked repository" className={field} value={repo} disabled={busy}
          onChange={(event) => setRepo(event.target.value)}>
          <option value="">None</option>
          {repos.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true); setError(null);
            try {
              const result = await sdk.plugins.callRpc({
                pluginId: TASKS_PLUGIN,
                method: "createProject",
                input: { name: name.trim(), prefix: effectivePrefix, color: "blue", folderId: null, linkedBbProjectId: repo || null },
                outputSchema: tasksContract.createProject.output,
              });
              onCreated({ id: result.project.id, prefix: result.project.prefix, linkedBbProjectId: repo || null });
              onClose();
            } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
            finally { setBusy(false); }
          }}>{busy ? "Creating…" : "Create project"}</button>
      </div>
    </DialogContent>
  </Dialog>;
}
