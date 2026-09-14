import { useState } from "react";
import { z } from "zod";
import { experimental_NewThreadComposer as NewThreadComposer, useRpc, type NewThreadRequest } from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { projectSidebarRpcContract } from "./server";

export function ManagerCreate({ project, onClose, onCreated }: {
  project: { id: string; name: string };
  onClose: () => void;
  onCreated: (threadId: string) => void;
}) {
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(request: NewThreadRequest) {
    if (busy) throw new Error("The Core is already starting.");
    setError(null);
    setBusy(true);
    try {
      if (request.projectId !== project.id) throw new Error(`Select ${project.name} to start its Core.`);
      const result = await rpc.call("createManager", { projectId: project.id, request: z.json().parse(request) });
      if (!result.project.coordinatorThreadId) throw new Error("The Core is still starting. Retry to reopen it.");
      onCreated(result.project.coordinatorThreadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="ps-create-dialog sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project.name}</DialogTitle>
          <DialogDescription>Start the project conversation. Its Core can plan work, delegate to Workers and keep shared notes.</DialogDescription>
        </DialogHeader>
        <NewThreadComposer defaultProjectId={project.id} draftKey={`project-manager:${project.id}`} onSubmit={submit} placeholder="What should we work on?" />
        {busy ? <p role="status" className="text-xs text-muted-foreground">Starting Core…</p> : null}
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
