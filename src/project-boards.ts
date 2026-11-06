import { useCallback, useEffect, useMemo, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { z } from "zod";

const projectsOutput = z.object({
  projects: z.array(
    z.object({ id: z.string(), name: z.string(), prefix: z.string(), linkedBbProjectId: z.string().nullable() }).passthrough(),
  ),
});
const metaOutput = z.object({ leadThreadId: z.string().nullable(), focus: z.string().nullable() }).passthrough();
const tasksOutput = z.object({
  tasks: z.array(z.object({ status: z.string(), parentTaskId: z.string().nullable() }).passthrough()),
});
const cardMetaOutput = z.object({
  cards: z.array(z.object({ taskId: z.string(), activeThreads: z.array(z.unknown()) }).passthrough()),
});

export interface ProjectBoard {
  id: string;
  name: string;
  prefix: string;
  bbProjectId: string | null;
  leadThreadId: string | null;
  focus: string | null;
  working: number;
  review: number;
}

const REFRESH_MS = 20_000;

export function useProjectBoards(): { boards: ProjectBoard[]; leadIds: ReadonlySet<string>; reload: () => void } {
  const sdk = useSdk();
  const [boards, setBoards] = useState<ProjectBoard[]>([]);

  const load = useCallback(async () => {
    try {
      const { projects } = await sdk.plugins.callRpc({ pluginId: "tasks", method: "listProjects", input: {}, outputSchema: projectsOutput });
      const next = await Promise.all(
        projects.map(async (project): Promise<ProjectBoard> => {
          const [meta, tasks, cards] = await Promise.all([
            sdk.plugins
              .callRpc({ pluginId: "projects", method: "getMeta", input: { projectId: project.id }, outputSchema: metaOutput })
              .catch(() => null),
            sdk.plugins
              .callRpc({ pluginId: "tasks", method: "listAllTasks", input: { projectId: project.id }, outputSchema: tasksOutput })
              .catch(() => null),
            sdk.plugins
              .callRpc({ pluginId: "tasks", method: "listTaskCardMeta", input: { projectId: project.id }, outputSchema: cardMetaOutput })
              .catch(() => null),
          ]);
          return {
            id: project.id,
            name: project.name,
            prefix: project.prefix,
            bbProjectId: project.linkedBbProjectId,
            leadThreadId: meta?.leadThreadId ?? null,
            focus: meta?.focus ?? null,
            working: cards?.cards.filter((card) => card.activeThreads.length > 0).length ?? 0,
            review: tasks?.tasks.filter((task) => task.parentTaskId === null && task.status === "in_review").length ?? 0,
          };
        }),
      );
      setBoards((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    } catch {
      setBoards((current) => (current.length === 0 ? current : []));
    }
  }, [sdk]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const leadIds = useMemo(
    () => new Set(boards.flatMap((board) => (board.leadThreadId ? [board.leadThreadId] : []))),
    [boards],
  );
  return { boards, leadIds, reload: () => void load() };
}

export function openProjectBoard(projectId: string) {
  window.history.pushState(window.history.state, "", `/plugins/projects/projects/${encodeURIComponent(projectId)}`);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

const leadOutput = z.object({ leadThreadId: z.string().nullable() }).passthrough();

export function useRemoveManager() {
  const sdk = useSdk();
  return (projectId: string) =>
    sdk.plugins.callRpc({ pluginId: "projects", method: "setLead", input: { projectId, threadId: null }, outputSchema: leadOutput });
}
