import { useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { projectSidebarRpcContract } from "./server";

/**
 * Reinitialize a Core: replace its conversation under the same stable Core
 * identity. Ownership, references, Context binding and Assignment history are
 * preserved; the previous Core stays visible as history.
 */
export function ReinitializeCoreDialog({ core, onClose, onDone }: {
  core: { id: string; name: string };
  onClose(): void;
  onDone(message: string): void;
}) {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rpc.call("reinitializeCore", {
        projectId: core.id,
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      });
      const conflicts = result.conflicts.length;
      onDone(
        conflicts > 0
          ? `Reinitialized ${core.name}. ${conflicts} owned famil${conflicts === 1 ? "y" : "ies"} could not transfer and stayed put.`
          : `Reinitialized ${core.name}. Its owned families now sit under the replacement Core.`,
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="ps-create-dialog">
        <DialogHeader>
          <DialogTitle>Reinitialize Core?</DialogTitle>
          <DialogDescription>
            Replaces the Core conversation for “{core.name}”. Context, references, ownership and Assignment history stay.
            Owned families transfer to the replacement Core; the old Core stays as history. This is refused while a
            Worker is running.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-2 text-sm">
          Optional starting prompt
          <textarea
            aria-label="Optional starting prompt"
            className="min-h-16 rounded border border-border bg-background p-2"
            disabled={busy}
            maxLength={8_000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Continue where the previous Core left off."
            value={prompt}
          />
        </label>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="rounded px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
            disabled={busy}
            onClick={() => { void submit(); }}
          >
            {busy ? "Reinitializing…" : "Reinitialize Core"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
