import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export const STANDALONE = "standalone-chats";
/** A native BB Project's section key. */
export const NATIVE_PROJECT_PREFIX = "native:";
export const projectSectionId = (id: string) => `${NATIVE_PROJECT_PREFIX}${id}`;
export const nativeProjectSectionId = projectSectionId;

export interface NativeProjectRef {
  id: string;
  name: string;
  isPersonal: boolean;
}

export type HomeKind = "project" | "chats";

/** Which top-level group a section key belongs to. */
export function homeKindOf(sectionId: string): HomeKind {
  if (sectionId === STANDALONE) return "chats";
  return "project";
}

/**
 * Resolve one primary sidebar home per thread.
 *
 * Non-personal native Projects keep their members. Remaining personal /
 * unfiled families belong under Chats. Native project IDs stay on
 * `nativeProjectId`; `projectId` is the display section key.
 */
export function projectThreadView(
  threads: readonly PluginSidebarThread[],
  nativeProjects: readonly NativeProjectRef[],
): PluginSidebarThread[] {
  const personalIds = new Set(
    nativeProjects.filter((project) => project.isPersonal).map((project) => project.id),
  );
  return threads.map((thread) => {
    const home = personalIds.has(thread.projectId)
      ? STANDALONE
      : nativeProjectSectionId(thread.projectId);
    return { ...thread, nativeProjectId: thread.projectId, projectId: home };
  });
}

