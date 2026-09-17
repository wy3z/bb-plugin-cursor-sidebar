import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export function isWorking(thread: PluginSidebarThread): boolean {
  const { activity } = thread;
  return (
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0 ||
    thread.indicator === "runtime" ||
    thread.indicator === "working-draft"
  );
}

/** Pending user input is the only truthful "someone must act" signal. */
export function needsAttention(thread: PluginSidebarThread): boolean {
  return thread.hasPendingInteraction;
}

/** Display membership is projected from explicit ownership and actual ancestry before aggregation. */
export function projectIsWorking(projectId: string, threads: readonly PluginSidebarThread[]): boolean {
  return threads.some((thread) => thread.projectId === projectId && !thread.isArchived && isWorking(thread));
}

export function projectNeedsAttention(projectId: string, threads: readonly PluginSidebarThread[]): boolean {
  return threads.some((thread) => thread.projectId === projectId && !thread.isArchived && needsAttention(thread));
}


