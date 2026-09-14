/**
 * Core ownership, shared by the sidebar projection and the row actions.
 *
 * A Core is Exo's stable managed record. Its native conversation is identified
 * by `coordinatorThreadId`; a Core-owned ordinary family's native root has that
 * coordinator as its parent. Assignment ownership (a Worker) is recorded
 * separately from ordinary Core-owned chats, so an adopted chat is never
 * mistaken for a Worker and never gains an Assignment badge.
 *
 * Verified `owned` rows describe real native ancestry plus a recorded transfer.
 * `unverified` legacy rows are deliberately never treated as owned: an unknown
 * provenance must not become a home. When the manager's verified read fails the
 * sidebar keeps the last verified snapshot and marks it stale; it never falls
 * back to an association row, and a first read failure owns nothing.
 */
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export interface CoreSummary {
  id: string;
  name: string;
  bbProjectId: string;
  coordinatorThreadId: string | null;
}

export interface ManagedWorker {
  threadId: string;
  coordinatorThreadId: string | null;
  settledAt: number | null;
  acceptedUpdatedAt: number | null;
  reviewRequired: boolean;
}

export interface Membership {
  rootThreadId: string;
  projectId: string;
  threadIds: string[];
}

/** How fresh the manager's verified ownership read is. */
export type ExecutionObservation = "current-read" | "stale" | "unknown";

export interface OwnershipTransfer {
  requestKey: string;
  kind: string;
  phase: string;
  rootThreadId: string;
  error: string | null;
  /**
   * The Core the family is leaving, when the manager recorded it. Null for an
   * adoption into a Core that had no prior owner.
   */
  sourceOwnerProjectId: string | null;
  /** The Core the family is moving to, or null for a release. */
  targetProjectId: string | null;
}

export interface CoreOwnership {
  owned: { rootThreadId: string; projectId: string; threadIds: string[] }[];
  unverified: { rootThreadId: string; projectId: string }[];
  references: { rootThreadId: string; projectId: string }[];
  transfers: OwnershipTransfer[];
}

export const EMPTY_OWNERSHIP: CoreOwnership = {
  owned: [],
  unverified: [],
  references: [],
  transfers: [],
};

export interface CoreIndex {
  coreByCoordinator: ReadonlyMap<string, string>;
  coreByOwnedRoot: ReadonlyMap<string, string>;
  coreByMember: ReadonlyMap<string, string>;
  coreByWorker: ReadonlyMap<string, string>;
  /** Roots linked as a non-owning reference, by the Cores that hold them. */
  referencesByRoot: ReadonlyMap<string, ReadonlySet<string>>;
  /** Roots with a recorded but unverified legacy association, by Core. */
  unverifiedByRoot: ReadonlyMap<string, ReadonlySet<string>>;
  /** Recorded transfers whose phase is not yet verified. */
  unresolvedTransfers: readonly OwnershipTransfer[];
  byId: ReadonlyMap<string, CoreSummary>;
}

export const EMPTY_CORE_INDEX: CoreIndex = {
  coreByCoordinator: new Map(),
  coreByOwnedRoot: new Map(),
  coreByMember: new Map(),
  coreByWorker: new Map(),
  referencesByRoot: new Map(),
  unverifiedByRoot: new Map(),
  unresolvedTransfers: [],
  byId: new Map(),
};

function pushInto(map: Map<string, Set<string>>, key: string, value: string): void {
  const held = map.get(key);
  if (held) held.add(value);
  else map.set(key, new Set([value]));
}

/**
 * Build the ownership index from the manager's verified read.
 *
 * `observation` describes how fresh that read is. A stale read still projects
 * the last verified snapshot so existing families keep their home, but the
 * caller must not treat it as current proof for a move. An unavailable read
 * (never succeeded) owns nothing because there is no verified snapshot at all.
 * Association rows are never consulted: an unknown provenance is not a home.
 */
export function buildCoreIndex(
  cores: readonly CoreSummary[],
  workers: readonly ManagedWorker[],
  ownership: CoreOwnership,
  observation: ExecutionObservation,
): CoreIndex {
  const byId = new Map(cores.map((core) => [core.id, core] as const));
  const coreByCoordinator = new Map<string, string>();
  for (const core of cores) {
    if (core.coordinatorThreadId) coreByCoordinator.set(core.coordinatorThreadId, core.id);
  }

  const coreByOwnedRoot = new Map<string, string>();
  const coreByMember = new Map<string, string>();
  for (const entry of ownership.owned) {
    if (!byId.has(entry.projectId)) continue;
    coreByOwnedRoot.set(entry.rootThreadId, entry.projectId);
    for (const threadId of entry.threadIds) coreByMember.set(threadId, entry.projectId);
    coreByMember.set(entry.rootThreadId, entry.projectId);
  }

  const coreByWorker = new Map<string, string>();
  for (const worker of workers) {
    const coreId = worker.coordinatorThreadId
      ? coreByCoordinator.get(worker.coordinatorThreadId)
      : undefined;
    if (coreId) coreByWorker.set(worker.threadId, coreId);
  }

  const referencesByRoot = new Map<string, Set<string>>();
  for (const reference of ownership.references) {
    if (!byId.has(reference.projectId)) continue;
    pushInto(referencesByRoot, reference.rootThreadId, reference.projectId);
  }

  const unverifiedByRoot = new Map<string, Set<string>>();
  for (const row of ownership.unverified) {
    if (!byId.has(row.projectId)) continue;
    pushInto(unverifiedByRoot, row.rootThreadId, row.projectId);
  }

  const unresolvedTransfers = ownership.transfers.filter(
    (transfer) => transfer.phase !== "verified",
  );

  return {
    coreByCoordinator,
    coreByOwnedRoot,
    coreByMember,
    coreByWorker,
    referencesByRoot,
    unverifiedByRoot,
    unresolvedTransfers,
    byId,
  };
}

/**
 * The stable Core id that owns this thread, walking native ancestry and
 * stopping at a Core coordinator. Returns null for an unowned ordinary thread.
 */
export function owningCoreId(
  threadId: string,
  parentOf: (id: string) => string | null,
  index: CoreIndex,
): string | null {
  let cursor: string | null = threadId;
  const seen = new Set<string>();
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const coordinatorCore = index.coreByCoordinator.get(cursor);
    if (coordinatorCore) return coordinatorCore;
    const owned =
      index.coreByMember.get(cursor) ??
      index.coreByWorker.get(cursor) ??
      index.coreByOwnedRoot.get(cursor);
    if (owned) return owned;
    cursor = parentOf(cursor);
  }
  return null;
}

/** The role one Core row carries, used for its icon and for review gating. */
export type CoreRowRole = "core" | "worker" | "owned-chat";

/**
 * The role of a thread as a Core-owned child; null when it is not one. The
 * role is always proven against the index: an absent read never invents an
 * owned home.
 */
export function coreRowRole(
  coreId: string | null,
  threadId: string,
  index: CoreIndex,
): CoreRowRole | null {
  if (coreId === null) return null;
  if (index.coreByCoordinator.get(threadId) === coreId) return "core";
  if (index.coreByWorker.get(threadId) === coreId) return "worker";
  if (index.coreByMember.get(threadId) === coreId || index.coreByOwnedRoot.get(threadId) === coreId) {
    return "owned-chat";
  }
  return null;
}

/**
 * The provenance of one ordinary row relative to the Cores: a verified owned
 * role, an unverified legacy association, or a non-owning reference. This is
 * the actionable read the sidebar renders as a marker and a resolution action.
 * A row with no Core relationship at all is null.
 */
export type ThreadOwnershipHint =
  | { kind: "core"; coreId: string; role: CoreRowRole }
  | { kind: "unverified"; coreId: string }
  | { kind: "reference"; coreIds: readonly string[] };

export function ownershipHint(
  threadId: string,
  parentOf: (id: string) => string | null,
  index: CoreIndex,
): ThreadOwnershipHint | null {
  const coreId = owningCoreId(threadId, parentOf, index);
  if (coreId !== null) {
    const role = coreRowRole(coreId, threadId, index);
    if (role !== null) return { kind: "core", coreId, role };
  }
  let cursor: string | null = threadId;
  const seen = new Set<string>();
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const references = index.referencesByRoot.get(cursor);
    if (references && references.size > 0) {
      return { kind: "reference", coreIds: [...references] };
    }
    const unverified = index.unverifiedByRoot.get(cursor);
    if (unverified && unverified.size > 0) {
      return { kind: "unverified", coreId: [...unverified][0]! };
    }
    cursor = parentOf(cursor);
  }
  return null;
}

/**
 * Cores with at least one unresolved recorded transfer, attributed by the
 * recorded source and target identities only. An adoption flags the receiving
 * Core and an A-to-B move flags both A and B. A transfer whose recorded
 * identities are missing is never attributed to the family's current owner: an
 * unknown provenance is not proof of who is involved.
 */
export function coresWithUnresolvedTransfers(index: CoreIndex): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const transfer of index.unresolvedTransfers) {
    if (transfer.sourceOwnerProjectId && index.byId.has(transfer.sourceOwnerProjectId)) {
      ids.add(transfer.sourceOwnerProjectId);
    }
    if (transfer.targetProjectId && index.byId.has(transfer.targetProjectId)) {
      ids.add(transfer.targetProjectId);
    }
  }
  return ids;
}

/**
 * Unresolved transfers whose recorded identities name no known Core. These are
 * unattributed: the sidebar marks them in a stable global region with the
 * recorded request key, so a user can reconcile against the authority instead
 * of being shown a guessed source or receiver.
 */
export function unattributedTransfers(index: CoreIndex): readonly OwnershipTransfer[] {
  return index.unresolvedTransfers.filter(
    (transfer) =>
      !(
        (transfer.sourceOwnerProjectId !== null && index.byId.has(transfer.sourceOwnerProjectId)) ||
        (transfer.targetProjectId !== null && index.byId.has(transfer.targetProjectId))
      ),
  );
}

/**
 * Unresolved transfers that touch one Core, by recorded source/target identity,
 * for the Core's reconciliation action. A transfer without recorded identities
 * is not attributed to any Core and stays in the global unattributed region.
 */
export function unresolvedTransfersForCore(
  coreId: string,
  index: CoreIndex,
): readonly OwnershipTransfer[] {
  return index.unresolvedTransfers.filter(
    (transfer) =>
      transfer.sourceOwnerProjectId === coreId || transfer.targetProjectId === coreId,
  );
}

/** Native parent lookup over the live feed, for ancestry walks. */
export function parentLookup(
  threads: readonly PluginSidebarThread[],
): (id: string) => string | null {
  const byId = new Map(threads.map((thread) => [thread.id, thread] as const));
  return (id: string) => byId.get(id)?.parentThreadId ?? null;
}
