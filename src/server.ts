// bb-plugin-project-sidebar backend — the settled store and the order overlay.
//
// This state lives in the plugin's own SQLite database, never on bb's thread.
// Putting it on the thread would mean a schema change, a wire change, and a
// HOST_DAEMON_PROTOCOL_VERSION bump for something only this sidebar
// understands. Here, uninstalling the plugin removes its state with it.
//
// Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
// see THIRD-PARTY-NOTICES.md at the repository root.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

export interface StoredLifecycleRow {
  threadId: string;
  settledAt: number | null;
}

interface LifecycleDbRow {
  thread_id: string;
  settled_at: number | null;
}

const migrations = [
  // `snoozed_*` are kept only so an existing store migrates without a table
  // rewrite. They are cleared on load and never written again.
  `CREATE TABLE IF NOT EXISTS thread_lifecycle (
     thread_id      TEXT PRIMARY KEY,
     settled_at     INTEGER,
     snoozed_until  INTEGER,
     snoozed_at     INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS thread_order (
     scope      TEXT NOT NULL,
     thread_id  TEXT NOT NULL,
     position   INTEGER NOT NULL,
     PRIMARY KEY (scope, thread_id)
   )`,
  `CREATE TABLE IF NOT EXISTS thread_order_revision (
     scope     TEXT PRIMARY KEY,
     revision  INTEGER NOT NULL
   )`,
  // Project visibility is view preference, but it must travel between a
  // user's devices. Kept server-side so hiding on one client hides on the
  // others, while project existence stays authoritative in project-manager.
  `CREATE TABLE IF NOT EXISTS project_visibility (
     project_id  TEXT PRIMARY KEY,
     hidden      INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL
   )`,
  // The one persisted SidebarView: grouping, conversation/group ordering,
  // metadata visibility and the supported filters. A second view preference
  // store is deliberately avoided by keeping this beside project_visibility in
  // the plugin database, so device layout (collapse.ts) stays separate and the
  // view travels between a user's clients like the visibility list does.
  `CREATE TABLE IF NOT EXISTS sidebar_view (
     id          INTEGER PRIMARY KEY CHECK (id = 1),
     json        TEXT NOT NULL,
     updated_at  INTEGER NOT NULL
   )`,
];

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });
const scopeSchema = z.string().trim().min(1).max(400);

const managerSchema = z.object({
  name: z.string(),
  id: z.string(),
  bbProjectId: z.string(),
  coordinatorThreadId: z.string().nullable(),
});
const managedWorkerSchema = z.object({
  threadId: z.string(), coordinatorThreadId: z.string().nullable(),
  settledAt: z.number().nullable(), acceptedUpdatedAt: z.number().nullable(), reviewRequired: z.boolean().default(false),
});
const managedWorkersSchema = z.object({ workers: z.array(managedWorkerSchema) });
const membershipSchema = z.object({ rootThreadId: z.string(), projectId: z.string(), threadIds: z.array(z.string()) });
const membershipListSchema = z.object({ projects: z.array(managerSchema), memberships: z.array(membershipSchema) });
const managersSchema = z.object({ projects: z.array(managerSchema) });

// The one persisted SidebarView contract. Grouping is one exclusive radio:
// `workspace` (Projects: native project homes, no extra thread grouping),
// `updated` date buckets (the default), `status` the shared status precedence,
// or `environment` a human host/workspace heading. Selecting one replaces the
// others; they never stack. Extra grouping wraps standalone threads only. The
// Projects heading follows the Projects grouping choice. `statusFilter` lists the selected ordinary
// status kinds, so its full set is "all", a subset narrows and an empty list is
// "none". `environmentFilter` is null for "all environments", an array selects
// a subset and an empty array is "none"; the `__none__` key selects rows that
// have no environment. `manual` preserves the existing stored conversation
// order; the automatic orderings ignore it. Only supported facts appear: no
// repository key, no per-thread CI counts, no PR or archived toggle, and no
// source taxonomy.
const viewGroupBySchema = z.enum(["workspace", "updated", "status", "environment"]);
const viewConversationOrderSchema = z.enum(["manual", "updated", "status"]);
const viewGroupOrderSchema = z.enum(["manual", "updated"]);
const viewStatusFilterSchema = z.enum(["input", "failed", "working", "unread", "idle"]);
const sidebarViewSchema = z
  .object({
    groupBy: viewGroupBySchema,
    sortConversationsBy: viewConversationOrderSchema,
    sortGroupsBy: viewGroupOrderSchema,
    statusFilter: z.array(viewStatusFilterSchema).max(5),
    environmentFilter: z.array(z.string().trim().min(1).max(200)).max(200).nullable(),
    show: z.object({
      updated: z.boolean(),
      environment: z.boolean(),
      branch: z.boolean(),
      host: z.boolean(),
      pr: z.boolean(),
    }),
  })
  .strict();
export type SidebarView = z.infer<typeof sidebarViewSchema>;


const ownershipPhaseSchema = z.enum(["prepared", "native-applied", "verified", "conflict", "uncertain"]);
// One recorded ownership transfer, mirrored from the manager's `moveThreadToCore`
// / `removeThreadFromCore` result. The sidebar renders the phase and never
// guesses an outcome the manager has not verified.
const ownershipTransferSchema = z.object({
  requestKey: z.string(),
  phase: ownershipPhaseSchema,
  rootThreadId: z.string(),
  threadIds: z.array(z.string()),
  ownerProjectId: z.string().nullable(),
  nativeParentId: z.string().nullable(),
  nativeParentKnown: z.boolean(),
  currentMismatch: z.string().nullable(),
});
// The public Core ownership read. `owned` is verified native ancestry plus
// recorded ownership; `unverified` legacy rows are never shown as owned.
const coreOwnershipSchema = z.object({
  owned: z.array(z.object({ rootThreadId: z.string(), projectId: z.string(), threadIds: z.array(z.string()) })),
  unverified: z.array(z.object({ rootThreadId: z.string(), projectId: z.string() })),
  references: z.array(z.object({ rootThreadId: z.string(), projectId: z.string() })),
  transfers: z.array(z.object({
    requestKey: z.string(), kind: z.string(), phase: z.string(), rootThreadId: z.string(), error: z.string().nullable(),
    // Additive read projection: the recorded source and target Cores. Optional
    // so a manager without the projection still validates; the sidebar treats a
    // missing identity as unknown and never guesses the receiving Core.
    sourceOwnerProjectId: z.string().nullable().optional(),
    targetProjectId: z.string().nullable().optional(),
  })),
});
export type CoreOwnershipResult = z.infer<typeof coreOwnershipSchema>;

// Bounded subset of the manager's getWorkspaceAttention read. The manager's
// response carries more fields; zod strips the extras, and every field used
// here is required by the manager, so a shape drift fails closed.
const attentionEntrySchema = z.object({
  threadId: z.string().nullable(),
  disposition: z.string(),
  reviewable: z.boolean().optional(),
  live: z.enum(["working", "starting", "queued"]).nullable().optional(),
  needsYou: z.boolean().optional(),
  // The recorded exact generation identity, kept so a repeated entry collapses
  // by generation rather than a loose thread id. Optional for an older manager
  // that never recorded one; `hasExactIdentity` says which.
  assignmentId: z.string().nullable().optional(),
  assignmentRevision: z.number().int().nonnegative().nullable().optional(),
  executionId: z.string().nullable().optional(),
  terminalSeq: z.number().int().nullable().optional(),
  hasExactIdentity: z.boolean().optional(),
});
const attentionOutputSchema = z.object({
  observation: z.enum(["current-read", "stale", "unknown"]).optional(),
  counts: z.object({
    forReview: z.number().int().nonnegative(),
    integrated: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    settled: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    needsYou: z.number().int().nonnegative(),
    working: z.number().int().nonnegative(),
    starting: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
  }),
  attention: z.array(attentionEntrySchema),
  open: z.array(attentionEntrySchema),
  /** True when the bounded actionable list was truncated; counts stay exact. */
  hasMore: z.boolean(),
  listening: z.number().int().nonnegative(),
});

// Bounded subset of the manager's subscription projection, the durable
// Listening source. `state` is the real native-backed state, so paused is never
// inferred from a listening count.
const listeningOutputSchema = z.object({
  available: z.boolean(),
  subscriptions: z.array(z.object({
    id: z.string(), name: z.string(), state: z.string(), enabled: z.boolean(),
  })),
});

const handoverSchema = z.object({
  id: z.string(),
  requestKey: z.string(),
  projectId: z.string(),
  sourceThreadId: z.string(),
  sourceRootThreadId: z.string(),
  sourceTitle: z.string(),
  sourceSeqEnd: z.number().int().nonnegative().nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  mode: z.enum(["handover", "reference"]),
  status: z.enum(["awaiting_manager", "reviewed"]),
  notifyState: z.enum(["pending", "sending", "sent", "uncertain"]).optional(),
  notified: z.boolean(),
  reviewedAt: z.number().nullable(),
  createdAt: z.number(),
});

const pmExecutionSelectionSchema = z.object({
  providerId: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(400).optional(),
  reasoningLevel: z.string().min(1).max(40).optional(),
  permissionMode: z.string().min(1).max(40).optional(),
  serviceTier: z.string().min(1).max(40).optional(),
});

export const projectSidebarRpcContract = defineRpcContract({
  listWorkspaces: {
    input: z.object({ environmentIds: z.array(z.string().min(1)).max(100) }),
    output: z.object({ workspaces: z.array(z.object({ environmentId: z.string(), path: z.string().nullable(), name: z.string().nullable(), hostId: z.string() })) }),
  },
  primaryHost: {
    input: z.object({}),
    output: z.object({ hostId: z.string().nullable() }),
  },
  moveMembership: {
    input: z.object({ threadId: z.string().min(1), projectId: z.string().nullable(), expectedProjectId: z.string().nullable() }),
    output: z.object({ rootThreadId: z.string(), threadIds: z.array(z.string()), projectId: z.string().nullable() }),
  },
  managedWorkersChanged: { input: z.object({}), output: z.object({ ok: z.boolean() }) },
  listManagers: {
    input: z.object({}),
    output: z.object({ available: z.boolean(), membershipAvailable: z.boolean(), projects: z.array(managerSchema), workers: z.array(managedWorkerSchema), memberships: z.array(membershipSchema) }),
  },
  /**
   * Verified Core ownership read. The sidebar resolves one primary home from
   * this, not from cosmetic association rows. `unverified` legacy membership
   * rows never read as owned.
   */
  coreOwnership: {
    input: z.object({}),
    output: coreOwnershipSchema,
  },
  /**
   * Bounded, per-Core exact-generation attention read. Proxies the manager's
   * getWorkspaceAttention for one Core only, so the sidebar never fans out a
   * whole-workspace endpoint. Counts and entries are exact; the listening
   * number is a count, not a paused-state proof.
   */
  coreAttention: {
    input: z.object({ projectId: z.string().trim().min(1), focusThreadId: z.string().trim().min(1).optional() }),
    output: attentionOutputSchema,
  },
  /**
   * Per-Core Listening health from the manager's native subscription
   * projection. `state`/`enabled` are the real facts, so paused is never
   * inferred from a count. A failed read reports `available: false`.
   */
  coreListeningHealth: {
    input: z.object({ projectId: z.string().trim().min(1) }),
    output: listeningOutputSchema,
  },
  /**
   * Resolve one unverified legacy association by explicit provenance. The
   * manager decides whether proven ownership migrates or the row becomes a
   * non-owning reference; the sidebar never guesses.
   */
  convertLegacyAssociation: {
    input: z.object({
      threadId: z.string().trim().min(1),
      projectId: z.string().trim().min(1),
      provenance: z.enum(["ownership", "handover", "reference", "unknown"]).optional(),
    }),
    output: z.object({ action: z.enum(["moved", "linked"]), rootThreadId: z.string() }),
  },
  /** Reconcile one recorded transfer against both authorities by identity. */
  reconcileOwnershipTransfer: {
    input: z.object({ requestKey: z.string().trim().min(1).max(200) }),
    output: ownershipTransferSchema,
  },
  /**
   * Real ownership transfer through the manager's guarded operation. Records
   * intent and request identity, reparents the family root, and reports the
   * verified phase. Never mints an Assignment or rewrites a native Project.
   */
  moveThreadToCore: {
    input: z.object({
      threadId: z.string().trim().min(1),
      projectId: z.string().trim().min(1).nullable(),
      requestKey: z.string().trim().min(1).max(200).optional(),
    }),
    output: ownershipTransferSchema,
  },
  /** Release a Core-owned ordinary family back to its native home. */
  removeThreadFromCore: {
    input: z.object({
      threadId: z.string().trim().min(1),
      requestKey: z.string().trim().min(1).max(200).optional(),
    }),
    output: ownershipTransferSchema,
  },
  /** Reference-only link: durable, non-owning, no wake and no home change. */
  addCoreReference: {
    input: z.object({ threadId: z.string().trim().min(1), projectId: z.string().trim().min(1) }),
    output: z.object({ rootThreadId: z.string(), projectId: z.string() }),
  },
  /** Replace a Core conversation under the same stable Core identity. */
  reinitializeCore: {
    input: z.object({
      projectId: z.string().trim().min(1),
      prompt: z.string().trim().min(1).max(8_000).optional(),
    }),
    output: z.object({
      project: managerSchema,
      previousCoordinatorThreadId: z.string(),
      coordinatorThreadId: z.string(),
      previousStop: z.string(),
      previousStopError: z.string().nullable(),
      conflicts: z.array(z.object({
        rootThreadId: z.string(), kind: z.enum(["ordinary", "worker"]), detail: z.string(),
      })),
    }),
  },
  /**
   * Directory-backed native BB Project creation. Creates no Core. The name is
   * derived from the directory by the manager resolver, which also reuses an
   * existing same host+path Project; the composer never sends a name.
   */
  createNativeProject: {
    input: z.object({
      hostId: z.string().trim().min(1),
      path: z.string().trim().min(1),
    }),
    output: z.object({ id: z.string(), name: z.string() }),
  },
  listHosts: {
    input: z.object({}),
    output: z.object({ hosts: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })) }),
  },
  pickFolder: {
    input: z.object({ hostId: z.string().trim().min(1) }),
    output: z.object({ path: z.string().nullable() }),
  },
  projectVisibility: {
    input: z.object({}),
    output: z.object({ hiddenIds: z.array(z.string()) }),
  },
  setProjectVisibility: {
    input: z.object({ projectId: z.string().trim().min(1), hidden: z.boolean() }),
    output: z.object({ hiddenIds: z.array(z.string()) }),
  },
  mergeProjectVisibility: {
    input: z.object({ hiddenIds: z.array(z.string().trim().min(1)).max(10_000) }),
    output: z.object({ hiddenIds: z.array(z.string()) }),
  },
  /** The shared persisted SidebarView, or null when the user has not set one. */
  sidebarView: {
    input: z.object({}),
    output: z.object({ view: sidebarViewSchema.nullable() }),
  },
  /** Replace the shared persisted SidebarView. */
  setSidebarView: {
    input: z.object({ view: sidebarViewSchema }),
    output: z.object({ view: sidebarViewSchema }),
  },
  createManager: {
    // The Project Manager plugin owns validation of the native composer request.
    input: z.object({ projectId: z.string().min(1), request: z.json() }),
    output: z.object({ project: managerSchema }),
  },
  startProjectFromThread: {
    // The Project Manager plugin owns creation, idempotency and the context
    // handoff. The source chat is retained; only managed membership is added.
    // With `projectId` the chat is attached to an existing Project Manager:
    // `handover` persists a deduplicated request and notifies it, `reference`
    // associates silently.
    input: z.object({
      threadId: z.string().trim().min(1),
      name: z.string().trim().min(1).max(200).optional(),
      note: z.string().trim().max(2_000).optional(),
      projectId: z.string().trim().min(1).max(200).optional(),
      mode: z.enum(["handover", "reference"]).optional(),
      requestMarker: z.string().trim().min(1).max(200).optional(),
      execution: pmExecutionSelectionSchema.optional(),
    }),
    output: z.object({
      project: managerSchema,
      created: z.boolean().optional(),
      mode: z.enum(["handover", "reference"]).nullable().optional(),
      handover: handoverSchema.nullable().optional(),
    }),
  },
  listHandoverRequests: {
    input: z.object({ projectId: z.string().trim().min(1).max(200).optional() }),
    output: z.object({ requests: z.array(handoverSchema) }),
  },
  threadExecutionDefaults: {
    // Resolves the source chat's current native execution so the handover
    // dialog can seed the model picker. Providers/models are native facts.
    input: z.object({ threadId: z.string().trim().min(1) }),
    output: z.object({
      model: z.string().nullable(),
      reasoningLevel: z.string().nullable(),
      serviceTier: z.string().nullable(),
    }),
  },
  openManager: {
    input: z.object({ managerId: z.string().min(1) }),
    output: z.object({ coordinatorThreadId: z.string().nullable() }),
  },
  deleteManager: {
    input: z.object({ managerId: z.string().min(1) }),
    output: z.object({ projectId: z.string() }),
  },
  listLifecycle: {
    input: z.object({}),
    output: z.object({
      rows: z.array(
        z.object({
          threadId: z.string(),
          settledAt: z.number().nullable(),
        }),
      ),
    }),
  },
  settle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  unsettle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  listThreadOrders: {
    input: z.object({}),
    output: z.object({
      orders: z.array(
        z.object({
          scope: z.string(),
          threadIds: z.array(z.string()),
          revision: z.number().int().nonnegative(),
        }),
      ),
    }),
  },
  reorderThreads: {
    input: z
      .object({
        scope: scopeSchema,
        threadIds: z.array(z.string().trim().min(1)).max(10_000),
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict(),
    output: z.object({
      threadIds: z.array(z.string()),
      revision: z.number().int().nonnegative(),
      applied: z.boolean(),
    }),
  },
  reorderProjects: {
    input: z.object({
      projectId: z.string().trim().min(1),
      previousProjectId: z.string().trim().min(1).nullable(),
      nextProjectId: z.string().trim().min(1).nullable(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  listThreadSections: {
    // BB's native named sections back standalone folders. The list is the
    // folder registry; thread.sectionId on each sidebar thread carries the
    // assignment, so no plugin table is needed.
    input: z.object({}),
    output: z.object({
      sections: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  },
  createThreadSection: {
    input: z.object({ name: z.string().trim().min(1).max(200) }),
    output: z.object({ section: z.object({ id: z.string(), name: z.string() }) }),
  },
  renameThreadSection: {
    input: z.object({ id: z.string().trim().min(1), name: z.string().trim().min(1).max(200) }),
    output: z.object({ section: z.object({ id: z.string(), name: z.string() }) }),
  },
  deleteThreadSection: {
    // Native delete unfiles the section's threads; they fall back to their
    // date groups. Nothing is archived or deleted.
    input: z.object({ id: z.string().trim().min(1) }),
    output: z.object({ updatedThreadCount: z.number().int().nonnegative() }),
  },
  setThreadSection: {
    // File or unfile one whole display family with native section state.
    // The guard reads authoritative managed association from the Project
    // Manager plugin: coordinators, workers and member families are never
    // filed, and a managed id anywhere in the request fails the whole move
    // closed before any write. Native project ids and thread origins are not
    // consulted: an ordinary thread in a native project, an Exo-spawned
    // standalone chat and a foreign-plugin thread are all valid here when
    // unmanaged. When membership cannot be read the move pauses instead of
    // guessing.
    input: z.object({
      threadIds: z.array(z.string().trim().min(1)).min(1).max(500),
      sectionId: z.string().trim().min(1).nullable(),
    }),
    output: z.object({
      updated: z.array(z.string()),
      failed: z.array(z.string()),
    }),
  },
});

/** Channels the frontend re-reads on. */
export const LIFECYCLE_CHANNEL = "lifecycle";
export const THREAD_ORDER_CHANNEL = "thread-order";
export const PROJECT_ORDER_CHANNEL = "project-order";
export const VISIBILITY_CHANNEL = "project-visibility";
/** Published when the shared persisted SidebarView changes. */
export const SIDEBAR_VIEW_CHANNEL = "sidebar-view";
/** Published when the native section registry may have changed. */
export const THREAD_SECTIONS_CHANNEL = "thread-sections";

/** Every thread id the Project Manager owns: coordinators, workers, members. */
async function readManagedThreadIds(bb: BbPluginApi): Promise<ReadonlySet<string>> {
  const membership = await bb.sdk.plugins.callRpc({
    pluginId: "project-manager", method: "listProjectMemberships",
    input: {}, outputSchema: membershipListSchema,
  });
  let workers: z.infer<typeof managedWorkerSchema>[] = [];
  try {
    workers = (await bb.sdk.plugins.callRpc({
      pluginId: "project-manager", method: "listManagedWorkerLifecycle",
      input: {}, outputSchema: managedWorkersSchema,
    })).workers;
  } catch { /* Older Project Manager plugin: coordinators and memberships still guard. */ }
  return new Set([
    ...membership.projects.flatMap((project) => project.coordinatorThreadId ? [project.coordinatorThreadId] : []),
    ...membership.memberships.flatMap((member) => [member.rootThreadId, ...member.threadIds]),
    ...workers.flatMap((worker) => worker.threadId ? [worker.threadId] : []),
    ...workers.flatMap((worker) => worker.coordinatorThreadId ? [worker.coordinatorThreadId] : []),
  ]);
}

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);

  // Snooze was removed. Existing snoozed records become ordinary active
  // threads; settled records are untouched.
  db.prepare(
    `UPDATE thread_lifecycle
        SET snoozed_until = NULL, snoozed_at = NULL
      WHERE snoozed_until IS NOT NULL OR snoozed_at IS NOT NULL`,
  ).run();

  const readAll = (): StoredLifecycleRow[] =>
    (
      db
        .prepare(`SELECT thread_id, settled_at FROM thread_lifecycle`)
        .all() as LifecycleDbRow[]
    ).map((row) => ({ threadId: row.thread_id, settledAt: row.settled_at }));

  const writeSettled = (threadId: string, settledAt: number | null): void => {
    db.prepare(
      `INSERT INTO thread_lifecycle
         (thread_id, settled_at, snoozed_until, snoozed_at)
       VALUES (?, ?, NULL, NULL)
       ON CONFLICT(thread_id) DO UPDATE SET
         settled_at = excluded.settled_at`,
    ).run(threadId, settledAt);
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  };

  const clearSettled = (threadId: string): void => {
    db.prepare(`DELETE FROM thread_lifecycle WHERE thread_id = ?`).run(threadId);
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  };

  const readVisibility = (): string[] =>
    (
      db
        .prepare(`SELECT project_id FROM project_visibility WHERE hidden = 1 ORDER BY project_id`)
        .all() as Array<{ project_id: string }>
    ).map((row) => row.project_id);

  const writeVisibility = (projectId: string, hidden: boolean): void => {
    if (hidden) {
      db.prepare(
        `INSERT INTO project_visibility (project_id, hidden, updated_at)
         VALUES (?, 1, ?)
         ON CONFLICT(project_id) DO UPDATE SET hidden = 1, updated_at = excluded.updated_at`,
      ).run(projectId, Date.now());
    } else {
      db.prepare(`DELETE FROM project_visibility WHERE project_id = ?`).run(projectId);
    }
  };

  const mergeVisibility = (ids: readonly string[]): void => {
    const insert = db.prepare(
      `INSERT INTO project_visibility (project_id, hidden, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(project_id) DO UPDATE SET hidden = 1, updated_at = excluded.updated_at`,
    );
    const now = Date.now();
    db.transaction((values: readonly string[]) => {
      for (const id of values) insert.run(id, now);
    })([...new Set(ids)]);
  };

  const readSidebarView = (): SidebarView | null => {
    const row = db
      .prepare(`SELECT json FROM sidebar_view WHERE id = 1`)
      .get() as { json: string } | undefined;
    if (row === undefined) return null;
    try {
      const parsed = sidebarViewSchema.safeParse(JSON.parse(row.json));
      return parsed.success ? parsed.data : null;
    } catch {
      // A corrupt row reads as unset; the client keeps its defaults instead of
      // rendering a half-valid view.
      return null;
    }
  };

  const writeSidebarView = (view: SidebarView): void => {
    db.prepare(
      `INSERT INTO sidebar_view (id, json, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(view), Date.now());
  };

  const readOrders = () => {
    const rows = db
      .prepare(
        `SELECT scope, thread_id FROM thread_order ORDER BY scope, position`,
      )
      .all() as Array<{ scope: string; thread_id: string }>;
    const revisions = new Map(
      (
        db
          .prepare(`SELECT scope, revision FROM thread_order_revision`)
          .all() as Array<{ scope: string; revision: number }>
      ).map((row) => [row.scope, row.revision]),
    );
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const held = grouped.get(row.scope);
      if (held) held.push(row.thread_id);
      else grouped.set(row.scope, [row.thread_id]);
    }
    return [...grouped.entries()].map(([scope, threadIds]) => ({
      scope,
      threadIds,
      revision: revisions.get(scope) ?? 0,
    }));
  };

  bb.rpc.register(projectSidebarRpcContract, {
    async listWorkspaces({ environmentIds }) {
      const workspaces = await Promise.all([...new Set(environmentIds)].map(async (environmentId) => {
        try {
          const env = await bb.sdk.environments.get({ environmentId });
          return { environmentId, path: env.path, name: env.name, hostId: env.hostId };
        } catch { return null; }
      }));
      return { workspaces: workspaces.filter((env) => env !== null) };
    },
    async primaryHost() {
      const config = await bb.sdk.system.config();
      return { hostId: config.primaryHostId };
    },
    async moveMembership(input) {
      const result = await bb.sdk.plugins.callRpc({ pluginId: "project-manager", method: "moveProjectMembership", input,
        outputSchema: projectSidebarRpcContract.moveMembership.output });
      bb.realtime.publish("managers", {});
      return result;
    },
    async managedWorkersChanged() {
      bb.realtime.publish("managers", {});
      return { ok: true };
    },
    async listManagers() {
      const result = await bb.sdk.plugins.list();
      const manager = result.plugins.find((plugin) => plugin.id === "project-manager");
      if (!manager || manager.status !== "running") return { available: false, membershipAvailable: false, projects: [], workers: [], memberships: [] };
      const data = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "listProjectManagers", input: {},
        outputSchema: managersSchema,
      });
      let workers: z.infer<typeof managedWorkerSchema>[] = [];
      try {
        workers = (await bb.sdk.plugins.callRpc({
          pluginId: "project-manager", method: "listManagedWorkerLifecycle", input: {},
          outputSchema: managedWorkersSchema,
        })).workers;
      } catch { /* Older Project Manager plugin: retain available ownership without lifecycle metadata. */ }
      try {
        const membership = await bb.sdk.plugins.callRpc({ pluginId: "project-manager", method: "listProjectMemberships", input: {}, outputSchema: membershipListSchema });
        return { available: true, membershipAvailable: true, projects: membership.projects, workers, memberships: membership.memberships };
      } catch {
        return { available: true, membershipAvailable: false, projects: data.projects, workers, memberships: [] };
      }
    },
    async createManager({ projectId, request }) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "createProjectManager",
        input: { projectId, request }, outputSchema: z.object({ project: managerSchema }),
      });
      bb.realtime.publish("managers", {});
      return result;
    },
    async coreOwnership() {
      return bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "listCoreOwnership", input: {},
        outputSchema: coreOwnershipSchema,
      });
    },
    async coreAttention({ projectId, focusThreadId }) {
      return bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "getWorkspaceAttention",
        input: focusThreadId ? { projectId, focusThreadId } : { projectId },
        outputSchema: attentionOutputSchema,
      });
    },
    async coreListeningHealth({ projectId }) {
      try {
        const result = await bb.sdk.plugins.callRpc({
          pluginId: "project-manager", method: "listSubscriptions",
          input: { projectId },
          outputSchema: z.object({
            subscriptions: z.array(z.object({
              id: z.string(), name: z.string(), state: z.string(), enabled: z.boolean(),
            })),
          }),
        });
        return { available: true, subscriptions: result.subscriptions };
      } catch {
        // The manager or its subscription projection is unavailable. Report
        // unknown rather than treating an empty count as "not paused".
        return { available: false, subscriptions: [] };
      }
    },
    async convertLegacyAssociation(input) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "convertLegacyAssociation",
        input, outputSchema: z.object({ action: z.enum(["moved", "linked"]), rootThreadId: z.string() }),
      });
      bb.realtime.publish("managers", {});
      return result;
    },
    async reconcileOwnershipTransfer(input) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "reconcileOwnershipTransfer",
        input, outputSchema: ownershipTransferSchema,
      });
      bb.realtime.publish("managers", {});
      return result;
    },
    async moveThreadToCore(input) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "moveThreadToCore",
        input, outputSchema: ownershipTransferSchema,
      });
      bb.realtime.publish("managers", {});
      return result;
    },
    async removeThreadFromCore(input) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "removeThreadFromCore",
        input, outputSchema: ownershipTransferSchema,
      });
      bb.realtime.publish("managers", {});
      return result;
    },
    async addCoreReference(input) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "addCoreReference",
        input, outputSchema: z.object({ rootThreadId: z.string(), projectId: z.string() }),
      });
      bb.realtime.publish("managers", {});
      return result;
    },
    async reinitializeCore(input) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "reinitCore",
        input, outputSchema: projectSidebarRpcContract.reinitializeCore.output,
      });
      bb.realtime.publish("managers", {});
      return result;
    },
    async createNativeProject({ hostId, path }) {
      // Reuse the manager's directory resolver, which returns the native Project
      // whose source is exactly this host+path and only creates one when none
      // exists. The create is in-flight coalesced there, so two clients picking
      // the same folder never mint a duplicate. There is no fallback to a
      // second create: a failure surfaces instead of duplicating the source.
      const resolved = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "resolveConversationDirectory",
        input: { hostId, path },
        outputSchema: z.object({ projectId: z.string(), name: z.string(), created: z.boolean() }),
      });
      bb.realtime.publish(PROJECT_ORDER_CHANNEL, {});
      return { id: resolved.projectId, name: resolved.name };
    },
    async listHosts() {
      const hosts = await bb.sdk.hosts.list();
      return { hosts: hosts.map((host) => ({ id: host.id, name: host.name, status: host.status })) };
    },
    async pickFolder({ hostId }) {
      const result = await bb.sdk.hosts.pickFolder({ hostId, clientHostId: hostId });
      return { path: result.path };
    },
    async startProjectFromThread(input) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "createProjectFromThread",
        input, outputSchema: projectSidebarRpcContract.startProjectFromThread.output,
      });
      bb.realtime.publish("managers", {});
      return result;
    },
    async listHandoverRequests({ projectId }) {
      return bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "listHandoverRequests",
        input: projectId ? { projectId } : {},
        outputSchema: z.object({ requests: z.array(handoverSchema) }),
      });
    },
    async threadExecutionDefaults({ threadId }) {
      try {
        const defaults = await bb.sdk.threads.defaultExecutionOptions({ threadId });
        return {
          model: defaults?.model ?? null,
          reasoningLevel: defaults?.reasoningLevel ?? null,
          serviceTier: defaults?.serviceTier ?? null,
        };
      } catch {
        return { model: null, reasoningLevel: null, serviceTier: null };
      }
    },
    async openManager({ managerId }) {
      return bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "openProject", input: { projectId: managerId },
        outputSchema: z.object({ coordinatorThreadId: z.string().nullable() }),
      });
    },
    async deleteManager({ managerId }) {
      // The Project Manager plugin owns the destructive semantics; this only
      // forwards and then shares the hidden state so the heading disappears on
      // every client immediately, even before their manager projection refetches.
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "project-manager", method: "deleteProjectManager",
        input: { projectId: managerId },
        outputSchema: z.object({ projectId: z.string() }),
      });
      writeVisibility(`managed:${managerId}`, true);
      bb.realtime.publish(VISIBILITY_CHANNEL, { projectId: managerId });
      bb.realtime.publish("managers", {});
      return { projectId: result.projectId };
    },
    projectVisibility() {
      return { hiddenIds: readVisibility() };
    },
    setProjectVisibility({ projectId, hidden }) {
      writeVisibility(projectId, hidden);
      bb.realtime.publish(VISIBILITY_CHANNEL, { projectId });
      return { hiddenIds: readVisibility() };
    },
    mergeProjectVisibility({ hiddenIds }) {
      mergeVisibility(hiddenIds);
      bb.realtime.publish(VISIBILITY_CHANNEL, {});
      return { hiddenIds: readVisibility() };
    },
    sidebarView() {
      return { view: readSidebarView() };
    },
    setSidebarView({ view }) {
      writeSidebarView(view);
      bb.realtime.publish(SIDEBAR_VIEW_CHANNEL, {});
      return { view };
    },
    async listLifecycle() {
      return { rows: readAll() };
    },
    async settle({ threadId }) {
      const thread = await bb.sdk.threads.get({ threadId });
      if (thread.originPluginId === "project-manager" && thread.originKind !== "fork") {
        throw new Error("Managed threads are settled automatically after Project Manager review.");
      }
      writeSettled(threadId, Date.now());
      return { ok: true };
    },
    async unsettle({ threadId }) {
      const thread = await bb.sdk.threads.get({ threadId });
      if (thread.originPluginId === "project-manager" && thread.originKind !== "fork") {
        throw new Error("Managed threads resume through follow-up work.");
      }
      clearSettled(threadId);
      return { ok: true };
    },
    async listThreadOrders() {
      return { orders: readOrders() };
    },
    async reorderThreads({ scope, threadIds, expectedRevision }) {
      const uniqueIds = [...new Set(threadIds)];
      const replace = db.transaction((ids: readonly string[]) => {
        const revisionRow = db
          .prepare(`SELECT revision FROM thread_order_revision WHERE scope = ?`)
          .get(scope) as { revision: number } | undefined;
        const revision = revisionRow?.revision ?? 0;
        if (revision !== expectedRevision) return { applied: false, revision };
        db.prepare(`DELETE FROM thread_order WHERE scope = ?`).run(scope);
        const insert = db.prepare(
          `INSERT INTO thread_order (scope, thread_id, position) VALUES (?, ?, ?)`,
        );
        ids.forEach((threadId, position) => insert.run(scope, threadId, position));
        const nextRevision = revision + 1;
        db.prepare(
          `INSERT INTO thread_order_revision (scope, revision) VALUES (?, ?)
           ON CONFLICT(scope) DO UPDATE SET revision = excluded.revision`,
        ).run(scope, nextRevision);
        return { applied: true, revision: nextRevision };
      });
      const result = replace(uniqueIds);
      if (result.applied) {
        bb.realtime.publish(THREAD_ORDER_CHANNEL, { scope });
        return { threadIds: uniqueIds, revision: result.revision, applied: true };
      }
      const current = readOrders().find((order) => order.scope === scope);
      return {
        threadIds: current?.threadIds ?? [],
        revision: result.revision,
        applied: false,
      };
    },
    async reorderProjects({ projectId, previousProjectId, nextProjectId }) {
      await bb.sdk.projects.reorder({
        projectId,
        previousProjectId,
        nextProjectId,
      });
      bb.realtime.publish(PROJECT_ORDER_CHANNEL, { projectId });
      return { ok: true };
    },
    async listThreadSections() {
      try {
        const sections = await bb.sdk.threadSections.list();
        return { sections: sections.map((section) => ({ id: section.id, name: section.name })) };
      } catch {
        throw new Error("Thread sections are unavailable on this host.");
      }
    },
    async createThreadSection({ name }) {
      const section = await bb.sdk.threadSections.create({ name });
      bb.realtime.publish(THREAD_SECTIONS_CHANNEL, { id: section.id });
      return { section: { id: section.id, name: section.name } };
    },
    async renameThreadSection({ id, name }) {
      const section = await bb.sdk.threadSections.update({ id, name });
      bb.realtime.publish(THREAD_SECTIONS_CHANNEL, { id: section.id });
      return { section: { id: section.id, name: section.name } };
    },
    async deleteThreadSection({ id }) {
      const result = await bb.sdk.threadSections.delete({ id });
      bb.realtime.publish(THREAD_SECTIONS_CHANNEL, { id });
      return { updatedThreadCount: result.updatedThreadCount };
    },
    async setThreadSection({ threadIds, sectionId }) {
      const uniqueIds = [...new Set(threadIds)];
      let managed: ReadonlySet<string>;
      try {
        managed = await readManagedThreadIds(bb);
      } catch {
        throw new Error("Project membership is unavailable; folder moves are paused until it returns.");
      }
      const blocked = uniqueIds.filter((threadId) => managed.has(threadId));
      if (blocked.length > 0) {
        throw new Error("Managed chats stay in their project; folders are for chats outside managed projects.");
      }
      const updated: string[] = [];
      const failed: string[] = [];
      for (const threadId of uniqueIds) {
        try {
          await bb.sdk.threads.update({ threadId, sectionId });
          updated.push(threadId);
        } catch {
          failed.push(threadId);
        }
      }
      return { updated, failed };
    },
  });

  // A deleted thread must not leave a row behind that would park a future
  // thread reusing the id, and stale order rows accumulate otherwise.
  bb.events.on("thread.deleted", ({ thread }) => {
    clearSettled(thread.id);
    db.prepare(`DELETE FROM thread_order WHERE thread_id = ?`).run(thread.id);
  });
}
