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
];

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });
const scopeSchema = z.string().trim().min(1).max(400);

export const projectSidebarRpcContract = defineRpcContract({
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
});

/** Channels the frontend re-reads on. */
export const LIFECYCLE_CHANNEL = "lifecycle";
export const THREAD_ORDER_CHANNEL = "thread-order";
export const PROJECT_ORDER_CHANNEL = "project-order";

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
    async listLifecycle() {
      return { rows: readAll() };
    },
    async settle({ threadId }) {
      writeSettled(threadId, Date.now());
      return { ok: true };
    },
    async unsettle({ threadId }) {
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
  });

  // A deleted thread must not leave a row behind that would park a future
  // thread reusing the id, and stale order rows accumulate otherwise.
  bb.events.on("thread.deleted", ({ thread }) => {
    clearSettled(thread.id);
    db.prepare(`DELETE FROM thread_order WHERE thread_id = ?`).run(thread.id);
  });
}
