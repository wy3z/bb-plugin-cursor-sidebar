import { useMemo } from "react";
import { experimental_useRpcQuery, useSdk } from "@get-bb/plugin-sdk/app";
import { PROJECTS_PLUGIN, TASKS_PLUGIN, projectsContract, tasksContract } from "@wy3z/bb-suite/contracts";

export interface ProjectBoard {
  id: string;
  name: string;
  prefix: string;
  bbProjectId: string | null;
  leadThreadId: string | null;
  focus: string | null;
}

export function useProjectBoards(): { boards: ProjectBoard[]; leadIds: ReadonlySet<string>; reload: () => void } {
  const projects = experimental_useRpcQuery({ pluginId: TASKS_PLUGIN, contract: tasksContract, method: "listProjects", input: {} });
  const leads = experimental_useRpcQuery({ pluginId: PROJECTS_PLUGIN, contract: projectsContract, method: "listLeads", input: {} });

  const boards = useMemo<ProjectBoard[]>(() => {
    const byProject = new Map((leads.data?.leads ?? []).map((lead) => [lead.projectId, lead]));
    return (projects.data?.projects ?? []).flatMap((project) => {
      const lead = byProject.get(project.id);
      if (!lead) return [];
      return [
        {
          id: project.id,
          name: project.name,
          prefix: project.prefix,
          bbProjectId: project.linkedBbProjectId,
          leadThreadId: lead.threadId,
          focus: lead.focus,
        },
      ];
    });
  }, [leads.data, projects.data]);

  const leadIds = useMemo(() => new Set(boards.flatMap((board) => (board.leadThreadId ? [board.leadThreadId] : []))), [boards]);
  return { boards, leadIds, reload: () => undefined };
}

export function openProjectBoard(projectId: string) {
  window.history.pushState(window.history.state, "", `/plugins/projects/projects/${encodeURIComponent(projectId)}`);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

export function useRemoveManager() {
  const sdk = useSdk();
  return (projectId: string) =>
    sdk.plugins.callRpc({
      pluginId: PROJECTS_PLUGIN,
      method: "setLead",
      input: { projectId, threadId: null },
      outputSchema: projectsContract.setLead.output,
    });
}
