import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  owningCoreId,
  parentLookup,
  type CoreIndex,
} from "./core-ownership";

export const STANDALONE = "standalone-chats";
/** A stable Core record's section key. */
export const CORE_PREFIX = "managed:";
/** A native BB Project's section key. */
export const NATIVE_PROJECT_PREFIX = "native:";
export const projectSectionId = (id: string) => `${CORE_PREFIX}${id}`;
export const coreSectionId = projectSectionId;
export const nativeProjectSectionId = (id: string) => `${NATIVE_PROJECT_PREFIX}${id}`;

export interface CoreRef {
  id: string;
  name: string;
  coordinatorThreadId: string | null;
  bbProjectId: string;
}

/** Backwards-compatible name for the managed Core summary. */
export interface ManagedProject extends CoreRef {}

export interface Membership {
  rootThreadId: string;
  projectId: string;
  threadIds: string[];
}

export interface NativeProjectRef {
  id: string;
  name: string;
  isPersonal: boolean;
}

export type HomeKind = "core" | "project" | "chats";

/** Which top-level group a section key belongs to. */
export function homeKindOf(sectionId: string): HomeKind {
  if (sectionId === STANDALONE) return "chats";
  if (sectionId.startsWith(CORE_PREFIX)) return "core";
  return "project";
}

/**
 * Resolve one primary sidebar home per thread before filtering or grouping.
 *
 * 1. A Core and its assigned Worker families belong under Core; assignment
 *    ownership wins over native Project and ordinary filing facts.
 * 2. A Core-owned chat family appears directly under its Core. It is absent
 *    from Projects and Chats while owned.
 * 3. Other ordinary families belong under their non-personal native Project.
 * 4. Remaining personal/unfiled families belong under Chats.
 *
 * Reference links and unverified legacy rows never create a home: a reference
 * stays where it already lives.
 */
export function projectThreadView(
  threads: readonly PluginSidebarThread[],
  index: CoreIndex,
  nativeProjects: readonly NativeProjectRef[],
): PluginSidebarThread[] {
  const parentOf = parentLookup(threads);
  const personalIds = new Set(
    nativeProjects.filter((project) => project.isPersonal).map((project) => project.id),
  );
  return threads.map((thread) => {
    const coreId = owningCoreId(thread.id, parentOf, index);
    let home: string;
    if (coreId !== null && index.byId.has(coreId)) {
      home = projectSectionId(coreId);
    } else if (!personalIds.has(thread.projectId)) {
      home = nativeProjectSectionId(thread.projectId);
    } else {
      home = STANDALONE;
    }
    return { ...thread, nativeProjectId: thread.projectId, projectId: home };
  });
}
