import { useEffect, useState, type ComponentProps } from "react";
import {
  experimental_ProviderModelPicker as ProviderModelPicker,
  useRpc,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { threadDisplayTitle } from "./inbox";
import type { projectSidebarRpcContract } from "./server";

type PickerValue = ComponentProps<typeof ProviderModelPicker>["value"];

/**
 * Start a new persistent Project Manager from a standalone chat.
 *
 * The chat and its native family are retained: nothing about storage,
 * parentage, environment or transcript changes. The Project Manager plugin
 * creates the manager, hands it a bounded faithful excerpt of this chat, and
 * associates the family so the chat appears under the new project. The
 * provider/model/effort picker is the native catalog picker and seeds the
 * Project Manager session itself; leaving it untouched inherits this chat.
 */
export function StartProjectFromThreadDialog({ thread, onClose, onStarted }: {
  thread: PluginSidebarThread;
  onClose(): void;
  onStarted(coordinatorThreadId: string | null): void;
}) {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const [name, setName] = useState(() => threadDisplayTitle(thread));
  const [note, setNote] = useState("");
  const [picker, setPicker] = useState<PickerValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc
      .call("threadExecutionDefaults", { threadId: thread.id })
      .then((defaults) => {
        if (cancelled) return;
        setPicker({
          providerId: thread.providerId,
          model: defaults.model ?? "",
          reasoningLevel: (defaults.reasoningLevel ?? "medium") as PickerValue["reasoningLevel"],
          ...(defaults.serviceTier ? { serviceTier: defaults.serviceTier as PickerValue["serviceTier"] } : {}),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPicker({
            providerId: thread.providerId,
            model: "",
            reasoningLevel: "medium" as PickerValue["reasoningLevel"],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, thread.id, thread.providerId]);

  const routing = thread.environment?.id
    ? { kind: "environment" as const, environmentId: thread.environment.id }
    : thread.host
      ? { kind: "host" as const, hostId: thread.host.id }
      : undefined;

  async function submit() {
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Name the Core before starting it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const execution = picker && picker.model
        ? {
            providerId: picker.providerId,
            model: picker.model,
            reasoningLevel: picker.reasoningLevel,
            ...(picker.serviceTier ? { serviceTier: picker.serviceTier } : {}),
          }
        : undefined;
      const result = await rpc.call("startProjectFromThread", {
        threadId: thread.id,
        name: trimmed,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(execution ? { execution } : {}),
      });
      onStarted(result.project.coordinatorThreadId ?? null);
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
          <DialogTitle>Start Core from thread</DialogTitle>
          <DialogDescription>
            Starts a separate Core using this chat&apos;s working directory and environment. This chat and its history
            stay exactly as they are and become a real child of the new Core; a bounded excerpt is handed over so you
            don&apos;t have to repeat context. The source family is retained.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-2 text-sm">
          Core name
          <input
            aria-label="Core name"
            autoFocus
            className="rounded border border-border bg-background p-2"
            disabled={busy}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <div className="flex flex-col gap-2 text-sm">
          <span>Core model and effort</span>
          {picker ? (
            <ProviderModelPicker
              value={picker}
              onChange={setPicker}
              {...(routing ? { routing } : {})}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Resolving this chat&apos;s current model…</span>
          )}
          <span className="text-xs text-muted-foreground">
            Uses the native catalog for this chat&apos;s environment. Leaving it as-is inherits this chat&apos;s
            current provider, model and effort.
          </span>
        </div>
        <label className="flex flex-col gap-2 text-sm">
          Optional note for the Core
          <textarea
            aria-label="Optional note for the Core"
            className="min-h-16 rounded border border-border bg-background p-2"
            disabled={busy}
            maxLength={2_000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Continue the migration; the branch is ready."
            value={note}
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
            {busy ? "Starting…" : "Start Core"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
