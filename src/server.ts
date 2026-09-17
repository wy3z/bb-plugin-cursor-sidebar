// bb-plugin-project-sidebar backend — settled store, order overlay, view prefs.
//
// This state lives in the plugin's own SQLite database, never on a BB thread.
// Uninstalling the plugin removes it. Native BB projects, threads, pins and
// folders stay on the host.
//
// Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
// see THIRD-PARTY-NOTICES.md at the repository root.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { derivedProjectName, normalizeDirectoryPath } from "./project-name";

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
];

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });
const scopeSchema = z.string().trim().min(1).max(400);

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
export { sidebarViewSchema };

export const projectSidebarRpcContract = defineRpcContract({
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
  createNativeProject: {
    input: z.object({
      hostId: z.string().trim().min(1),
      path: z.string().trim().min(1),
    }),
    output: z.object({ id: z.string(), name: z.string() }),
  },
  deleteNativeProject: {
    input: z.object({ projectId: z.string().trim().min(1) }),
    output: z.object({ ok: z.literal(true) }),
  },
  listHosts: {
    input: z.object({}),
    output: z.object({
      hosts: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
    }),
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
  sidebarView: {
    input: z.object({}),
    output: z.object({ view: sidebarViewSchema.nullable() }),
  },
  setSidebarView: {
    input: z.object({ view: sidebarViewSchema }),
    output: z.object({ view: sidebarViewSchema }),
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
});

export const LIFECYCLE_CHANNEL = "lifecycle";
export const THREAD_ORDER_CHANNEL = "thread-order";
export const PROJECT_ORDER_CHANNEL = "project-order";
export const VISIBILITY_CHANNEL = "project-visibility";
export const SIDEBAR_VIEW_CHANNEL = "sidebar-view";
export const THREAD_SECTIONS_CHANNEL = "thread-sections";

const inflightProjects = new Map<string, Promise<{ id: string; name: string }>>();

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);

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

  async function ensureNativeProject(hostId: string, path: string): Promise<{ id: string; name: string }> {
    const normalized = normalizeDirectoryPath(path);
    const key = `${hostId}\u0000${normalized}`;
    const pending = inflightProjects.get(key);
    if (pending) return pending;
    const promise = (async () => {
      const projects = await bb.sdk.projects.list();
      for (const project of projects) {
        const match = project.sources?.some(
          (source) =>
            source.type === "local_path" &&
            source.hostId === hostId &&
            normalizeDirectoryPath(source.path) === normalized,
        );
        if (match) return { id: project.id, name: project.name };
      }
      const host = await bb.sdk.hosts.get({ hostId }).catch(() => null);
      const name = derivedProjectName(normalized) || host?.name || "Workspace";
      const created = await bb.sdk.projects.create({
        name,
        source: { hostId, type: "local_path", path: normalized },
      });
      return { id: created.id, name: created.name };
    })().finally(() => {
      inflightProjects.delete(key);
    });
    inflightProjects.set(key, promise);
    return promise;
  }

  bb.rpc.register(projectSidebarRpcContract, {
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
    async createNativeProject({ hostId, path }) {
      const project = await ensureNativeProject(hostId, path);
      bb.realtime.publish(PROJECT_ORDER_CHANNEL, {});
      return project;
    },
    async deleteNativeProject({ projectId }) {
      await bb.sdk.projects.delete({ projectId });
      bb.realtime.publish(PROJECT_ORDER_CHANNEL, { projectId });
      return { ok: true as const };
    },
    async listHosts() {
      const hosts = await bb.sdk.hosts.list();
      return {
        hosts: hosts.map((host) => ({ id: host.id, name: host.name, status: host.status })),
      };
    },
    async pickFolder({ hostId }) {
      const result = await bb.sdk.hosts.pickFolder({ hostId, clientHostId: hostId });
      return { path: result.path };
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

  bb.events.on("thread.deleted", ({ thread }) => {
    clearSettled(thread.id);
    db.prepare(`DELETE FROM thread_order WHERE thread_id = ?`).run(thread.id);
  });
}
