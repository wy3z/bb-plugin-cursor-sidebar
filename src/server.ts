// bb-plugin-cursor-sidebar backend — order overlay, view prefs, project icons.
//
// This state lives in the plugin's own SQLite database, never on a BB thread.
// Uninstalling the plugin removes it. Native BB projects, threads, pins and
// folders stay on the host.
//
// Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
// see THIRD-PARTY-NOTICES.md at the repository root.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  PROJECT_ICON_CHANNEL,
  SIDEBAR_VIEW_CHANNEL,
  THREAD_ORDER_CHANNEL,
  THREAD_SECTIONS_CHANNEL,
} from "./channels";
import { coerceSidebarView } from "./sidebar-view";

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
  `CREATE TABLE IF NOT EXISTS project_visibility (
     project_id  TEXT PRIMARY KEY,
     hidden      INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sidebar_view (
     id          INTEGER PRIMARY KEY CHECK (id = 1),
     json        TEXT NOT NULL,
     updated_at  INTEGER NOT NULL
   )`,
  // Appended, never inserted: the migration runner matches recorded statements
  // by index, so a new migration only ever goes at the end. A project icon is
  // this plugin's overlay on a native project; the SDK has no field for it.
  `CREATE TABLE IF NOT EXISTS project_icon (
     project_id  TEXT PRIMARY KEY,
     icon        TEXT NOT NULL,
     updated_at  INTEGER
   )`,
];

const scopeSchema = z.string().trim().min(1).max(400);

// The overlay only guarantees a non-empty string; glyph names are validated in
// the app against the icon registry, never by importing React code here.
const projectIconRowSchema = z.object({
  projectId: z.string(),
  icon: z.string(),
});

const viewGroupBySchema = z.enum(["workspace", "updated", "status", "environment"]);
const viewConversationOrderSchema = z.enum(["updated", "status"]);
const viewGroupOrderSchema = z.enum(["manual", "updated"]);
/** How the project list is arranged: by hand, or by each project's worst status. */
const viewProjectOrderSchema = z.enum(["manual", "status"]);
const viewStatusFilterSchema = z.enum(["input", "failed", "working", "unread", "idle"]);
const sidebarViewSchema = z
  .object({
    groupBy: viewGroupBySchema,
    sortConversationsBy: viewConversationOrderSchema,
    sortGroupsBy: viewGroupOrderSchema,
    sortProjectsBy: viewProjectOrderSchema.default("manual"),
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
export { sidebarViewSchema };

export const cursorSidebarRpcContract = defineRpcContract({
  listWorkspaces: {
    input: z.object({ environmentIds: z.array(z.string().min(1)).max(100) }),
    output: z.object({
      workspaces: z.array(
        z.object({
          environmentId: z.string(),
          path: z.string().nullable(),
          name: z.string().nullable(),
          hostId: z.string(),
        }),
      ),
    }),
  },
  primaryHost: {
    input: z.object({}),
    output: z.object({ hostId: z.string().nullable() }),
  },
  deleteNativeProject: {
    input: z.object({ projectId: z.string().trim().min(1) }),
    output: z.object({ ok: z.literal(true) }),
  },
  listProjectIcons: {
    input: z.object({}),
    output: z.object({ icons: z.array(projectIconRowSchema) }),
  },
  setProjectIcon: {
    input: z.object({
      projectId: z.string().trim().min(1),
      icon: z.string().trim().min(1).max(100).nullable(),
    }),
    output: z.object({ icons: z.array(projectIconRowSchema) }),
  },
  sidebarView: {
    input: z.object({}),
    output: z.object({ view: sidebarViewSchema.nullable() }),
  },
  setSidebarView: {
    input: z.object({ view: sidebarViewSchema }),
    output: z.object({ view: sidebarViewSchema }),
  },
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
  listThreadSections: {
    input: z.object({}),
    output: z.object({
      sections: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  },
  renameThreadSection: {
    input: z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1).max(200),
    }),
    output: z.object({ section: z.object({ id: z.string(), name: z.string() }) }),
  },
  deleteThreadSection: {
    input: z.object({ id: z.string().trim().min(1) }),
    output: z.object({ updatedThreadCount: z.number().int().nonnegative() }),
  },
  setThreadSection: {
    input: z.object({
      threadIds: z.array(z.string().trim().min(1)).min(1).max(500),
      sectionId: z.string().trim().min(1).nullable(),
    }),
    output: z.object({
      updated: z.array(z.string()),
      failed: z.array(z.string()),
    }),
  },
  setThreadParent: {
    input: z.object({
      threadId: z.string().trim().min(1),
      parentThreadId: z.string().trim().min(1).nullable(),
    }),
    output: z.object({
      threadId: z.string(),
      parentThreadId: z.string().nullable(),
    }),
  },
});

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);

  const readIcons = (): Array<{ projectId: string; icon: string }> =>
    (
      db
        .prepare(`SELECT project_id, icon FROM project_icon ORDER BY project_id`)
        .all() as Array<{ project_id: string; icon: string }>
    ).map((row) => ({ projectId: row.project_id, icon: row.icon }));

  const writeIcon = (projectId: string, icon: string | null): void => {
    if (icon === null) {
      db.prepare(`DELETE FROM project_icon WHERE project_id = ?`).run(projectId);
      return;
    }
    db.prepare(
      `INSERT INTO project_icon (project_id, icon, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET icon = excluded.icon, updated_at = excluded.updated_at`,
    ).run(projectId, icon, Date.now());
  };

  const readSidebarView = (): SidebarView | null => {
    const row = db
      .prepare(`SELECT json FROM sidebar_view WHERE id = 1`)
      .get() as { json: string } | undefined;
    if (row === undefined) return null;
    try {
      const parsed = sidebarViewSchema.safeParse(JSON.parse(row.json));
      if (parsed.success) return parsed.data;
      // A row written by an older client can carry a value this version no
      // longer accepts (a removed enum, a stale shape). Coerce it the same way
      // the app does rather than discarding every stored choice.
      return coerceSidebarView(JSON.parse(row.json));
    } catch {
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
      .prepare(`SELECT scope, thread_id FROM thread_order ORDER BY scope, position`)
      .all() as Array<{ scope: string; thread_id: string }>;
    const revisions = new Map(
      (
        db
          .prepare(`SELECT scope, revision FROM thread_order_revision`)
          .all() as Array<{ scope: string; revision: number }>
      ).map((row) => [row.scope, row.revision]),
    );
    const grouped = new Map<string, string[]>();
    // Seed from the revisions so a scope whose ids were all removed still
    // reports its revision, instead of looking like revision 0 to a client.
    for (const scope of revisions.keys()) grouped.set(scope, []);
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

  bb.rpc.register(cursorSidebarRpcContract, {
    async listWorkspaces({ environmentIds }) {
      const workspaces = await Promise.all(
        [...new Set(environmentIds)].map(async (environmentId) => {
          try {
            const env = await bb.sdk.environments.get({ environmentId });
            return {
              environmentId,
              path: env.path,
              name: env.name,
              hostId: env.hostId,
            };
          } catch {
            return null;
          }
        }),
      );
      return { workspaces: workspaces.filter((env) => env !== null) };
    },
    async primaryHost() {
      const config = await bb.sdk.system.config();
      return { hostId: config.primaryHostId };
    },
    async deleteNativeProject({ projectId }) {
      await bb.sdk.projects.delete({ projectId });
      db.prepare(`DELETE FROM project_icon WHERE project_id = ?`).run(projectId);
      return { ok: true as const };
    },
    listProjectIcons() {
      return { icons: readIcons() };
    },
    setProjectIcon({ projectId, icon }) {
      writeIcon(projectId, icon);
      bb.realtime.publish(PROJECT_ICON_CHANNEL, { projectId });
      return { icons: readIcons() };
    },
    sidebarView() {
      return { view: readSidebarView() };
    },
    setSidebarView({ view }) {
      writeSidebarView(view);
      bb.realtime.publish(SIDEBAR_VIEW_CHANNEL, {});
      return { view };
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
    async listThreadSections() {
      try {
        const sections = await bb.sdk.threadSections.list();
        return { sections: sections.map((section) => ({ id: section.id, name: section.name })) };
      } catch {
        throw new Error("Thread sections are unavailable on this host.");
      }
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
    async setThreadParent({ threadId, parentThreadId }) {
      await bb.sdk.threads.update({ threadId, parentThreadId });
      return { threadId, parentThreadId };
    },
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    try {
      const scopes = (
        db
          .prepare(`SELECT DISTINCT scope FROM thread_order WHERE thread_id = ?`)
          .all(thread.id) as Array<{ scope: string }>
      ).map((row) => row.scope);
      if (scopes.length === 0) return;
      // Removing an id changes the authoritative set, so the revision must
      // move too; otherwise a client holding the old revision could pass its
      // compare-and-set and write the deleted id back.
      db.transaction(() => {
        db.prepare(`DELETE FROM thread_order WHERE thread_id = ?`).run(thread.id);
        const bump = db.prepare(
          `INSERT INTO thread_order_revision (scope, revision) VALUES (?, 1)
           ON CONFLICT(scope) DO UPDATE SET revision = revision + 1`,
        );
        for (const scope of scopes) bump.run(scope);
      })();
      for (const scope of scopes) bb.realtime.publish(THREAD_ORDER_CHANNEL, { scope });
    } catch {
      // The store is closing during shutdown; its rows go with it.
    }
  });
}
