import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { buildPooledOrdinarySection, buildSections, flattenShelf } from "./forest";
import {
  DEFAULT_SIDEBAR_VIEW,
  familyAwareComparator,
  groupOrdinaryRows,
  ordinaryFamilyFacts,
  ordinaryThreadStatus,
} from "./sidebar-view";

function thread(id: string, projectId: string, updatedAt: number,
  overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    id, projectId, title: id, titleFallback: null, displayTitle: id,
    parentThreadId: null, lifecycleOwnerThreadId: null, parentNotifications: "auto",
    sourceThreadId: null, sectionId: null, originKind: null, originPluginId: null,
    providerId: "codex", status: "idle", runtimeStatus: "idle", queuedWork: "none",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none", indicatorLabel: null, isUnread: false, isPinned: false,
    pinnedAt: null, pinSortKey: null, isArchived: false, archivedAt: null,
    href: `/threads/${id}`, isHidden: false, environment: null, host: null,
    createdAt: 0, updatedAt, lastReadAt: null, latestAttentionAt: 0,
    ...overrides,
  };
}

for (const groupBy of ["status", "updated", "environment"] as const) {
  test(`${groupBy} groups sort conversations across projects and keep children together`, () => {
    const members = [
      thread("a-old", "a", 10),
      thread("a-new", "a", 30),
      thread("b-parent", "b", 5),
      thread("b-child", "b", 20, { parentThreadId: "b-parent" }),
      thread("b-old", "b", 1),
    ];
    const render = () => {
      const parentOf = (id: string) => members.find((entry) => entry.id === id)?.parentThreadId ?? null;
      const familyFacts = ordinaryFamilyFacts(members, { parentOf, statusOf: ordinaryThreadStatus });
      const homes = buildSections(members, [{ id: "a", name: "A" }, { id: "b", name: "B" }],
        () => "active", () => ({ compare: familyAwareComparator("updated", familyFacts) }));
      const pool = buildPooledOrdinarySection(homes, "pool", "Chats");
      return groupOrdinaryRows(flattenShelf(pool, "active"), {
        ...DEFAULT_SIDEBAR_VIEW, groupBy, sortConversationsBy: "updated",
      }, { now: 100, parentOf, statusOf: ordinaryThreadStatus, members, familyFacts })
        .flatMap((group) => group.rows.map((row) => row.thread.id));
    };
    assert.deepEqual(render(), ["a-new", "b-parent", "b-child", "a-old", "b-old"]);
    members[0]!.updatedAt = 40;
    assert.deepEqual(render(), ["a-old", "a-new", "b-parent", "b-child", "b-old"]);
  });
}
