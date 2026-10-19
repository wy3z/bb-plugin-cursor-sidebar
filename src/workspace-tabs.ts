/**
 * Optional integration with the Workspaces plugin (bb-plugin-workspaces).
 *
 * Workspaces shows a thread's workspace as tabs in its header. Here, the
 * threads of one workspace nest under the workspace's first thread, the way
 * delegated children already nest under their parent, and that row takes the
 * workspace's name when it has one. Nothing changes unless the Workspaces
 * plugin is installed and running.
 *
 * Membership mirrors that plugin's rules for top-level threads: an explicit
 * workspace id in its thread metadata wins, then a shared worktree, then the
 * thread on its own. Delegated threads keep their native parent.
 */
import { useEffect, useMemo, useState } from "react";
import { useRpc, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { cursorSidebarRpcContract } from "./server";

/** Window event the Workspaces plugin fires after it changes membership. */
const CHANGED_EVENT = "bb-workspaces:changed";
const CHUNK = 100;
const FOCUS_REFRESH_MS = 30_000;

export interface WorkspaceTabMeta {
  workspaceId: string | null;
  workspaceName: string | null;
}

export interface WorkspaceTabsState {
  available: boolean;
  meta: ReadonlyMap<string, WorkspaceTabMeta>;
}

const UNAVAILABLE: WorkspaceTabsState = { available: false, meta: new Map() };

export function useWorkspaceTabs(threads: readonly PluginSidebarThread[]): WorkspaceTabsState {
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
  const key = threads.map((thread) => thread.id).sort().join("\0");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<WorkspaceTabsState>(UNAVAILABLE);

  useEffect(() => {
    let lastFocus = Date.now();
    const bump = () => setRevision((value) => value + 1);
    const onFocus = () => {
      if (Date.now() - lastFocus < FOCUS_REFRESH_MS) return;
      lastFocus = Date.now();
      bump();
    };
    window.addEventListener(CHANGED_EVENT, bump);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(CHANGED_EVENT, bump);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const ids = key ? key.split("\0") : [];
      const meta = new Map<string, WorkspaceTabMeta>();
      for (let index = 0; index < ids.length; index += CHUNK) {
        const result = await rpc.call("listWorkspaceTabs", { threadIds: ids.slice(index, index + CHUNK) });
        if (!result.available) {
          if (!disposed) setState(UNAVAILABLE);
          return;
        }
        for (const entry of result.threads) {
          meta.set(entry.threadId, { workspaceId: entry.workspaceId, workspaceName: entry.workspaceName });
        }
      }
      if (!disposed) setState({ available: ids.length > 0, meta });
    })().catch(() => {
      if (!disposed) setState(UNAVAILABLE);
    });
    return () => {
      disposed = true;
    };
  }, [rpc, key, revision]);

  return state;
}

function workspaceIdOf(thread: PluginSidebarThread, meta: ReadonlyMap<string, WorkspaceTabMeta>): string {
  const explicit = meta.get(thread.id)?.workspaceId;
  if (explicit) return explicit;
  // `isWorktree` is newer than this plugin's minimum SDK typings.
  const environment = thread.environment as { id: string | null; isWorktree?: boolean | null } | null;
  if (environment?.isWorktree && environment.id) return `env:${environment.id}`;
  return `thread:${thread.id}`;
}

/**
 * Nest each workspace's other top-level threads under its anchor: the thread
 * a `thread:<id>` workspace is named after, else the oldest member. Returns the
 * anchor → name map for rows to show. Native parents are never touched, and
 * only top-level threads in the same project move.
 */
export function applyWorkspaceNesting(
  threads: readonly PluginSidebarThread[],
  state: WorkspaceTabsState,
): { threads: PluginSidebarThread[]; names: ReadonlyMap<string, string> } {
  const names = new Map<string, string>();
  if (!state.available) return { threads: [...threads], names };

  const groups = new Map<string, PluginSidebarThread[]>();
  for (const thread of threads) {
    if (thread.parentThreadId !== null || thread.isArchived) continue;
    const id = `${thread.projectId}\0${workspaceIdOf(thread, state.meta)}`;
    const group = groups.get(id);
    if (group) group.push(thread);
    else groups.set(id, [thread]);
  }

  const parentOf = new Map<string, string>();
  for (const [id, members] of groups) {
    const workspaceId = id.slice(id.indexOf("\0") + 1);
    const named = workspaceId.startsWith("thread:") ? workspaceId.slice("thread:".length) : null;
    const anchor =
      members.find((thread) => thread.id === named) ??
      [...members].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0];
    if (!anchor) continue;
    const name = members.map((thread) => state.meta.get(thread.id)?.workspaceName).find(Boolean);
    if (name) names.set(anchor.id, name);
    for (const thread of members) if (thread.id !== anchor.id) parentOf.set(thread.id, anchor.id);
  }

  return {
    threads: threads.map((thread) => {
      const parentThreadId = parentOf.get(thread.id);
      return parentThreadId ? { ...thread, parentThreadId } : thread;
    }),
    names,
  };
}

export function useWorkspaceNesting(
  projected: readonly PluginSidebarThread[],
  raw: readonly PluginSidebarThread[],
) {
  const state = useWorkspaceTabs(raw);
  return useMemo(() => applyWorkspaceNesting(projected, state), [projected, state]);
}
