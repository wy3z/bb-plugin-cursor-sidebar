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
 *
 * A Core coordinator is filed in a native thread section so the manager can
 * find it. That section still appears in BB's global folder registry. It is
 * not a Chats folder: using it as one would draw a second copy of the Core
 * family. `coreNativeFolderIds` names those sections so Chats can omit them.
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

/**
 * Native thread-section ids used as a Core's filing, not as Chats folders.
 *
 * The manager places each coordinator in a named section. Chats owns the
 * global registry and would otherwise render that empty section as another
 * home next to the Core heading. Only coordinator filing is claimed: an
 * ordinary family's own folder stays a Chats folder even after a reference
 * or an unverified association, because those never move its home.
 */
export function coreNativeFolderIds(
  threads: readonly Pick<PluginSidebarThread, "id" | "sectionId">[],
  index: CoreIndex,
): Set<string> {
  const ids = new Set<string>();
  for (const thread of threads) {
    if (thread.sectionId == null) continue;
    if (index.coreByCoordinator.has(thread.id)) ids.add(thread.sectionId);
  }
  return ids;
}

/**
 * The folders Chats may render or file into. Core-claimed native sections are
 * omitted so a reference or an empty manager section cannot copy a family.
 */
export function chatsFolderRegistry<T extends { id: string }>(
  folders: readonly T[],
  coreFolderIds: ReadonlySet<string>,
): T[] {
  return folders.filter((folder) => !coreFolderIds.has(folder.id));
}
