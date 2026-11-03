/**
 * The one persisted SidebarView and its pure transforms.
 *
 * The view holds grouping, conversation ordering, group ordering, metadata
 * visibility and the supported filters. It never holds homes, folders, pin
 * flags or manual order: those stay native and are only read here. Every
 * control in this module is backed by a fact the sidebar feed already carries,
 * so an unsupported dimension (repository identity, per-thread CI counts, PR
 * state, source taxonomy, archived inclusion) is absent rather than faked.
 */
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { SidebarView } from "./server";
import { AGE_GROUPS, bucketForTimestamp, type AgeGroup } from "./age-groups";
import type { DisplayRow } from "./forest";
import { familyRootId } from "./standalone-groups";
import {
  THREAD_STATUS_LABEL,
  THREAD_STATUS_RANK,
  resolveThreadStatus,
  threadStatusFacts,
  type ThreadStatusKind,
} from "./status";

export const VIEW_GROUP_BY = [
  "workspace",
  "updated",
  "status",
  "environment",
  "none",
] as const;
export type ViewGroupBy = (typeof VIEW_GROUP_BY)[number];

/**
 * Conversations always take an automatic order; only groups are arrangeable.
 * A persisted "manual" from an older client is coerced to the default.
 */
export const VIEW_CONVERSATION_ORDER = ["updated", "status"] as const;
export type ViewConversationOrder = (typeof VIEW_CONVERSATION_ORDER)[number];

export const VIEW_GROUP_ORDER = ["manual", "updated"] as const;

export const VIEW_PROJECT_ORDER = ["manual", "status"] as const;
export type ViewProjectOrder = (typeof VIEW_PROJECT_ORDER)[number];

// Also the Status grouping's fixed section order: Unread always sits above Working.
export const VIEW_STATUS_FILTERS = ["input", "failed", "unread", "working", "idle"] as const;
export type ViewStatusFilter = (typeof VIEW_STATUS_FILTERS)[number];

/** The filter's own labels are the same strings the rows report. */
export const STATUS_FILTER_LABELS: Record<ViewStatusFilter, string> = THREAD_STATUS_LABEL;

/**
 * The age filter is exactly the Updated grouping's buckets, so a selected
 * bucket always matches a heading and a deselected one disappears with it.
 */
export const VIEW_AGE_FILTERS = AGE_GROUPS;
export type ViewAgeFilter = AgeGroup;

/** The bucket names double as their filter labels. */
export const AGE_FILTER_LABELS: Record<ViewAgeFilter, string> = {
  Today: "Today",
  Yesterday: "Yesterday",
  "Last 7 days": "Last 7 days",
  "Last 30 days": "Last 30 days",
  Older: "Older",
};

/**
 * How many inactive conversations one group previews before its "Show more"
 * control. `null` is "All": every conversation renders and no control appears.
 * A page is one set of this many top-level conversations; a family always
 * counts once and an active, selected or pinned one always shows.
 */
export const THREADS_PER_GROUP_VALUES = [5, 10, 20, 50] as const;
export type ThreadsPerGroup = (typeof THREADS_PER_GROUP_VALUES)[number] | null;
export const DEFAULT_THREADS_PER_GROUP: ThreadsPerGroup = 10;

/** The page size a persisted value renders: "All" is no limit at all. */
export function threadsPerGroupPage(value: ThreadsPerGroup): number {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

/** The value's menu label: the number, or "All". */
export function threadsPerGroupLabel(value: ThreadsPerGroup): string {
  return value === null ? "All" : String(value);
}

/**
 * Defaults recover the agreed view: native Projects / Chats homes with date
 * buckets on the pooled ordinary homes, the existing stored
 * conversation order, and every ordinary status, environment and project shown.
 * Projects / Updated / Status / Environment / None grouping is one exclusive
 * choice.
 */
export const DEFAULT_SIDEBAR_VIEW: SidebarView = {
  groupBy: "workspace",
  sortConversationsBy: "updated",
  sortGroupsBy: "manual",
  sortProjectsBy: "manual",
  threadsPerGroup: DEFAULT_THREADS_PER_GROUP,
  statusFilter: [...VIEW_STATUS_FILTERS],
  ageFilter: [...VIEW_AGE_FILTERS],
  environmentFilter: null,
  projectFilter: null,
  show: {
    updated: true,
    environment: true,
    branch: true,
    host: true,
    pr: true,
    providerIcons: true,
    projectIcons: true,
  },
};

/** The side of the sync that last failed: a local save, or a shared read. */
export type SidebarViewFailure = "save" | "read";

/**
 * How the shown view relates to the shared acknowledged value. `saving` is an
 * optimistic local change that is not confirmed yet, `unsaved` is a local
 * change whose write failed (kept visible, but honestly not saved), and
 * `unreadable` is an unreadable store with no local change pending.
 */
export type SidebarViewSync =
  | { kind: "synced" }
  | { kind: "saving" }
  | { kind: "unsaved"; store: "readable" | "unreadable" }
  | { kind: "unreadable" };

export interface SidebarViewStore {
  view: SidebarView;
  /** Shared per user, so a filter change travels between the user's clients. */
  update: (patch: Partial<SidebarView>) => void;
  /** Whether the shown view is saved, saving, unsaved or unreadable. */
  sync: SidebarViewSync;
  /** Re-attempt the unsaved change, or the failed read, once. */
  retry: () => void;
}

export interface SidebarViewSyncNotice {
  text: string;
  tone: "warning" | "error";
}

/**
 * The concise, truthful feedback for a sync state. A failed save keeps saying
 * the shown change is unsaved even after a successful recovery read, because
 * that read proves the store is readable, not that the change was written.
 */
export function sidebarViewSyncNotice(
  sync: SidebarViewSync,
): SidebarViewSyncNotice | null {
  if (sync.kind === "synced" || sync.kind === "saving") return null;
  if (sync.kind === "unsaved") {
    return {
      tone: "warning",
      text:
        sync.store === "readable"
          ? "View changes aren't saved."
          : "View changes aren't saved and the shared view is unreadable.",
    };
  }
  return { tone: "error", text: "The shared sidebar view is unavailable." };
}

function isStatusFilter(value: unknown): value is ViewStatusFilter {
  return VIEW_STATUS_FILTERS.some((supported) => supported === value);
}

/**
 * A persisted status list keeps its explicit state: its full set is all, a
 * subset narrows and an empty list is none. Only a list that named values but
 * kept none of them (an older client, or a corrupt row) falls back to the
 * default, so a deliberate "none" is never reinterpreted as "all".
 */
function coerceStatusFilter(raw: unknown): ViewStatusFilter[] {
  if (!Array.isArray(raw)) return [...VIEW_STATUS_FILTERS];
  const valid = raw.filter(isStatusFilter);
  if (raw.length > 0 && valid.length === 0) return [...VIEW_STATUS_FILTERS];
  return [...new Set(valid)];
}

function isAgeFilter(value: unknown): value is ViewAgeFilter {
  return VIEW_AGE_FILTERS.some((supported) => supported === value);
}

/**
 * Same contract as the status filter: a missing list (an older stored view) is
 * every bucket, a full set is all, a subset narrows and an empty list is none.
 * Only a list that named values but kept none of them falls back to the default.
 */
function coerceAgeFilter(raw: unknown): ViewAgeFilter[] {
  if (!Array.isArray(raw)) return [...VIEW_AGE_FILTERS];
  const valid = raw.filter(isAgeFilter);
  if (raw.length > 0 && valid.length === 0) return [...VIEW_AGE_FILTERS];
  return [...new Set(valid)];
}

/**
 * `null` is "all environments"; an array selects a subset and an empty array is
 * "none". An array that named values but kept none of them falls back to all.
 */
function coerceEnvironmentFilter(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const valid = raw.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  if (raw.length > 0 && valid.length === 0) return null;
  return [...new Set(valid)];
}

/**
 * `null` is "all projects"; an array selects a subset and an empty array is
 * "none". An array that named values but kept none of them falls back to all.
 */
function coerceProjectFilter(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const valid = raw.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  if (raw.length > 0 && valid.length === 0) return null;
  return [...new Set(valid)];
}

/**
 * The persisted threads-per-group value. Missing or unsupported (an older or
 * corrupt row) falls back to the default page; an explicit `null` survives as
 * "All", never as a fallback.
 */
function coerceThreadsPerGroup(raw: unknown): ThreadsPerGroup {
  if (raw === null) return null;
  return (
    THREADS_PER_GROUP_VALUES.find((value) => value === raw) ??
    DEFAULT_THREADS_PER_GROUP
  );
}

/**
 * Coerce a persisted view to the supported shape at the client boundary. The
 * server already validates it, but a view written by an older client, or a
 * partial one, must never put an unsupported value into a control. Every
 * invalid field falls back to its default; nothing is invented.
 */
export function coerceSidebarView(value: unknown): SidebarView {
  // A clone, never the module-level default: callers hold the result and must
  // not be able to mutate every other client's fallback in place.
  if (value === null || typeof value !== "object") {
    return {
      ...DEFAULT_SIDEBAR_VIEW,
      statusFilter: [...DEFAULT_SIDEBAR_VIEW.statusFilter],
      ageFilter: [...DEFAULT_SIDEBAR_VIEW.ageFilter],
      environmentFilter:
        DEFAULT_SIDEBAR_VIEW.environmentFilter === null
          ? null
          : [...DEFAULT_SIDEBAR_VIEW.environmentFilter],
      projectFilter:
        DEFAULT_SIDEBAR_VIEW.projectFilter === null
          ? null
          : [...DEFAULT_SIDEBAR_VIEW.projectFilter],
      show: { ...DEFAULT_SIDEBAR_VIEW.show },
    };
  }
  const raw = value as Record<string, unknown>;
  const groupBy = VIEW_GROUP_BY.find((entry) => entry === raw.groupBy) ?? DEFAULT_SIDEBAR_VIEW.groupBy;
  const sortConversationsBy =
    VIEW_CONVERSATION_ORDER.find((entry) => entry === raw.sortConversationsBy) ??
    DEFAULT_SIDEBAR_VIEW.sortConversationsBy;
  const sortGroupsBy =
    VIEW_GROUP_ORDER.find((entry) => entry === raw.sortGroupsBy) ??
    DEFAULT_SIDEBAR_VIEW.sortGroupsBy;
  const sortProjectsBy =
    VIEW_PROJECT_ORDER.find((entry) => entry === raw.sortProjectsBy) ??
    DEFAULT_SIDEBAR_VIEW.sortProjectsBy;
  const showRaw = (raw.show ?? {}) as Record<string, unknown>;
  const showFlag = (key: keyof SidebarView["show"]): boolean =>
    typeof showRaw[key] === "boolean"
      ? (showRaw[key] as boolean)
      : DEFAULT_SIDEBAR_VIEW.show[key];
  return {
    groupBy,
    sortConversationsBy,
    sortGroupsBy,
    sortProjectsBy,
    threadsPerGroup: coerceThreadsPerGroup(raw.threadsPerGroup),
    statusFilter: coerceStatusFilter(raw.statusFilter),
    ageFilter: coerceAgeFilter(raw.ageFilter),
    environmentFilter: coerceEnvironmentFilter(raw.environmentFilter),
    projectFilter: coerceProjectFilter(raw.projectFilter),
    show: {
      updated: showFlag("updated"),
      environment: showFlag("environment"),
      branch: showFlag("branch"),
      host: showFlag("host"),
      pr: showFlag("pr"),
      providerIcons: showFlag("providerIcons"),
      projectIcons: showFlag("projectIcons"),
    },
  };
}

/** The ordinary status a row resolves to from the native feed alone. */
export function ordinaryThreadStatus(thread: PluginSidebarThread): ViewStatusFilter {
  const kind = resolveThreadStatus(threadStatusFacts(thread));
  return ordinaryStatusFilterKind(kind);
}

function ordinaryStatusFilterKind(kind: ThreadStatusKind): ViewStatusFilter {
  switch (kind) {
    case "input":
    case "failed":
    case "working":
    case "unread":
    case "idle":
      return kind;
  }
}

function ordinaryStatusRank(thread: PluginSidebarThread): number {
  return THREAD_STATUS_RANK[resolveThreadStatus(threadStatusFacts(thread))];
}

/** A row's execution environment, or null when it has no environment yet. */
export interface EnvironmentIdentity {
  id: string;
  label: string;
}

export function environmentIdentityOf(
  thread: PluginSidebarThread,
): EnvironmentIdentity | null {
  const id = thread.environment?.id ?? null;
  if (id === null) return null;
  const label =
    thread.environment?.name?.trim() ||
    thread.host?.name?.trim() ||
    id;
  return { id, label };
}

/**
 * A directory name, not a BB environment/thread id. Personal workspaces often
 * use a raw `thr_`/`env_` id as the environment name; that is never grouped as
 * a heading.
 */
export function usableEnvironmentLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || "";
  if (trimmed === "" || /^(thr|env)_[a-z0-9]+$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * The Environment grouping and filter key for one family. Threads that share
 * a host or workspace name sit under one heading and one filter row (one
 * `arch`), instead of repeating that label per unique env id.
 */
export function environmentGroupOf(thread: PluginSidebarThread): EnvironmentIdentity {
  const envName = usableEnvironmentLabel(thread.environment?.name);
  if (envName !== null) {
    return { id: `name:${envName.toLowerCase()}`, label: envName };
  }
  const hostId = thread.host?.id?.trim() || null;
  const hostName = usableEnvironmentLabel(thread.host?.name);
  if (hostId !== null) {
    return { id: `host:${hostId}`, label: hostName ?? hostId };
  }
  if (hostName !== null) {
    return { id: `host-name:${hostName.toLowerCase()}`, label: hostName };
  }
  const envId = thread.environment?.id ?? null;
  if (envId !== null) {
    return { id: `env:${envId}`, label: envId };
  }
  return { id: NO_ENVIRONMENT_KEY, label: "No environment" };
}

export const NO_ENVIRONMENT_KEY = "__none__";

/** A project option in the filter menu: the native BB project id and its label. */
export interface ProjectIdentity {
  id: string;
  label: string;
}

/** The filter key for a thread with no native project at all. */
export const NO_PROJECT_KEY = "__no_project__";

/**
 * The native BB project a thread belongs to. Projected sidebar threads carry
 * the real id on `nativeProjectId`; a raw feed already has it on `projectId`.
 * A blank one is a real "no project", never a made-up id.
 */
export function projectKeyOf(thread: PluginSidebarThread): string {
  const native = (thread as PluginSidebarThread & { nativeProjectId?: string | null })
    .nativeProjectId;
  const id =
    typeof native === "string" && native.trim() !== ""
      ? native.trim()
      : thread.projectId?.trim() ?? "";
  return id === "" ? NO_PROJECT_KEY : id;
}

/**
 * The authoritative display parent within one ordinary home. A parent that
 * belongs to a different home (another Project or Chats) does not own the
 * child here, so the walk never crosses a home boundary. Mirrors the display
 * forest the renderer builds, before that forest exists.
 */
export function homeDisplayParentOf(
  threads: readonly PluginSidebarThread[],
): (threadId: string) => string | null {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  return (threadId: string): string | null => {
    const thread = byId.get(threadId);
    if (thread === undefined) return null;
    const parentId = thread.parentThreadId;
    if (parentId === null || parentId === threadId) return null;
    const parent = byId.get(parentId);
    if (parent === undefined || parent.projectId !== thread.projectId) return null;
    return parent.id;
  };
}

/** One family's aggregated facts, keyed by its display family root. */
export interface FamilyAggregate {
  status: ViewStatusFilter;
  environmentGroup: EnvironmentIdentity;
  latestUpdatedAt: number;
  firstIndex: number;
}

/** Family roots and their aggregates, computed over complete home data. */
export interface OrdinaryFamilyFacts {
  rootOf: ReadonlyMap<string, string>;
  /** Keyed by family root, so grouping and ordering read one map. */
  aggregateOf: ReadonlyMap<string, FamilyAggregate>;
}

type FamilyFactSources = Pick<
  OrdinaryGroupFacts,
  "parentOf" | "statusOf"
>;

function familyAggregates(
  threads: readonly PluginSidebarThread[],
  facts: FamilyFactSources,
): { rootOf: Map<string, string>; aggregates: Map<string, FamilyAggregate> } {
  const rootOf = new Map<string, string>();
  const aggregates = new Map<string, FamilyAggregate>();
  let firstIndex = 0;
  for (const thread of threads) {
    const root = familyRootId(facts.parentOf, thread.id);
    rootOf.set(thread.id, root);
    let aggregate = aggregates.get(root);
    if (aggregate === undefined) {
      aggregate = {
        status: facts.statusOf(thread),
        environmentGroup: environmentGroupOf(thread),
        latestUpdatedAt: thread.updatedAt,
        firstIndex: firstIndex++,
      };
      aggregates.set(root, aggregate);
    }
    aggregate.latestUpdatedAt = Math.max(aggregate.latestUpdatedAt, thread.updatedAt);
    const status = facts.statusOf(thread);
    if (THREAD_STATUS_RANK[status] < THREAD_STATUS_RANK[aggregate.status]) {
      aggregate.status = status;
    }
    if (aggregate.environmentGroup.id === NO_ENVIRONMENT_KEY) {
      const grouped = environmentGroupOf(thread);
      if (grouped.id !== NO_ENVIRONMENT_KEY) aggregate.environmentGroup = grouped;
    }
  }
  return { rootOf, aggregates };
}

/**
 * Family facts over one home's complete threads, before flatten or collapse, so
 * a folded descendant still decides its family's group and ordering. The caller
 * passes authoritative display parents, so families never cross homes.
 */
export function ordinaryFamilyFacts(
  members: readonly PluginSidebarThread[],
  facts: FamilyFactSources,
): OrdinaryFamilyFacts {
  const { rootOf, aggregates } = familyAggregates(members, facts);
  return { rootOf, aggregateOf: aggregates };
}

/**
 * The automatic conversation ordering, read from the same family aggregates the
 * grouping shows. A family sorts by the status or latest activity its divider
 * shows, so ordering and grouping never disagree; ties fall to the row's own
 * activity then its stable id.
 */
export function familyAwareComparator(
  order: ViewConversationOrder,
  facts: OrdinaryFamilyFacts,
): (left: PluginSidebarThread, right: PluginSidebarThread) => number {
  const aggregateOf = (thread: PluginSidebarThread): FamilyAggregate | undefined =>
    facts.aggregateOf.get(facts.rootOf.get(thread.id) ?? thread.id);
  if (order === "updated") {
    return (left, right) => {
      const leftAt = aggregateOf(left)?.latestUpdatedAt ?? left.updatedAt;
      const rightAt = aggregateOf(right)?.latestUpdatedAt ?? right.updatedAt;
      return rightAt - leftAt || left.id.localeCompare(right.id);
    };
  }
  return (left, right) => {
    const leftAggregate = aggregateOf(left);
    const rightAggregate = aggregateOf(right);
    const leftRank = leftAggregate
      ? THREAD_STATUS_RANK[leftAggregate.status]
      : ordinaryStatusRank(left);
    const rightRank = rightAggregate
      ? THREAD_STATUS_RANK[rightAggregate.status]
      : ordinaryStatusRank(right);
    return (
      leftRank - rightRank ||
      (rightAggregate?.latestUpdatedAt ?? right.updatedAt) -
        (leftAggregate?.latestUpdatedAt ?? left.updatedAt) ||
      left.id.localeCompare(right.id)
    );
  };
}

export interface OrdinaryFilterFacts {
  /** Pinned or current family: shown with an explanation, never filtered out. */
  bypass: (thread: PluginSidebarThread) => boolean;
  /** Current time for the calendar age buckets. */
  now: number;
  /**
   * Family aggregates over the complete unfiltered set, when the caller already
   * has them. Reusing one set keeps the age filter and the Updated heading on
   * the same family activity even when another filter hides a descendant.
   */
  familyFacts?: OrdinaryFamilyFacts | undefined;
}

/**
 * Whether a filter lets one row through. `null` is every environment. An
 * explicit list keeps a row whose environment *group* is named (one arch for
 * every thread on that host), or an environment-less row when `__none__` is
 * selected. Unique env ids from an older client still match as a fallback.
 */
function environmentAllowed(
  filter: readonly string[] | null,
  thread: PluginSidebarThread,
): boolean {
  if (filter === null) return true;
  const group = environmentGroupOf(thread);
  if (filter.includes(group.id)) return true;
  const identity = environmentIdentityOf(thread);
  if (identity !== null && filter.includes(identity.id)) return true;
  return false;
}

/**
 * Whether a filter lets one project's rows through. `null` is every project;
 * an explicit list keeps only the named native project ids, and `__no_project__`
 * keeps threads with no project.
 */
function projectAllowed(
  filter: readonly string[] | null,
  thread: PluginSidebarThread,
): boolean {
  if (filter === null) return true;
  return filter.includes(projectKeyOf(thread));
}

/**
 * Filter ordinary conversations by status, age, environment and project while
 * keeping the ancestry a surviving child needs. A pinned or current family is
 * always kept. Every ancestor of a kept row within its own home is kept, so a
 * match never detaches from its parent or loses its tree rails, and a child in
 * one project never drags in a parent from another. Age is judged for the whole
 * from the same latest activity the Updated grouping uses for its heading, so a
 * child never lands in a different bucket from its top-level thread. Nothing
 * here mutates pin, folder or manual-order state. The caller decides whether
 * native project interiors bypass the filter, and drops the groups of
 * filtered-out projects.
 */
export function filterOrdinaryThreads(
  threads: readonly PluginSidebarThread[],
  view: SidebarView,
  facts: OrdinaryFilterFacts,
): PluginSidebarThread[] {
  const parentOf = homeDisplayParentOf(threads);
  const familyRoot = facts.familyFacts?.rootOf;
  const familyAggregate = facts.familyFacts?.aggregateOf;
  const rootOf = new Map<string, string>();
  const familyLatest = new Map<string, number>();
  for (const thread of threads) {
    const root = familyRoot?.get(thread.id) ?? familyRootId(parentOf, thread.id);
    rootOf.set(thread.id, root);
    familyLatest.set(
      root,
      Math.max(familyLatest.get(root) ?? thread.updatedAt, thread.updatedAt),
    );
  }
  const ageAllowed = (thread: PluginSidebarThread): boolean => {
    const root = rootOf.get(thread.id) ?? thread.id;
    const latest =
      familyAggregate?.get(root)?.latestUpdatedAt ??
      familyLatest.get(root) ??
      thread.updatedAt;
    return view.ageFilter.includes(bucketForTimestamp(latest, facts.now));
  };
  const keep = new Set<string>();
  const matches = new Set<string>();
  for (const thread of threads) {
    if (facts.bypass(thread)) {
      keep.add(thread.id);
      continue;
    }
    if (!view.statusFilter.includes(ordinaryThreadStatus(thread))) continue;
    if (!ageAllowed(thread)) continue;
    if (!environmentAllowed(view.environmentFilter, thread)) continue;
    if (!projectAllowed(view.projectFilter, thread)) continue;
    matches.add(thread.id);
    keep.add(thread.id);
  }
  for (const id of matches) {
    // Ancestors follow the display forest's home boundary, so a child in one
    // project never drags its parent in from another project.
    let cursor = parentOf(id);
    const seen = new Set<string>([id]);
    while (cursor !== null && !seen.has(cursor)) {
      seen.add(cursor);
      keep.add(cursor);
      cursor = parentOf(cursor);
    }
  }
  return threads.filter((thread) => keep.has(thread.id));
}

/** True when a status, age, environment or project filter is narrowing the ordinary rows. */
export function viewHasActiveFilters(view: SidebarView): boolean {
  return (
    view.statusFilter.length < VIEW_STATUS_FILTERS.length ||
    view.ageFilter.length < VIEW_AGE_FILTERS.length ||
    view.environmentFilter !== null ||
    view.projectFilter !== null
  );
}

/**
 * The status-filter patch one checkbox produces. The list keeps its explicit
 * state, so unchecking the last status is a real "none", never silently "all".
 */
export function statusFilterPatch(
  view: SidebarView,
  status: ViewStatusFilter,
  on: boolean,
): Partial<SidebarView> {
  const next = on
    ? [...new Set([...view.statusFilter, status])]
    : view.statusFilter.filter((entry) => entry !== status);
  return { statusFilter: next };
}

/** The status-filter patch for the All/None controls. */
export function allStatusFilterPatch(on: boolean): Partial<SidebarView> {
  return { statusFilter: on ? [...VIEW_STATUS_FILTERS] : [] };
}

/**
 * The age-filter patch one checkbox produces, with the same explicit-state
 * contract: unchecking the last bucket is a real "none".
 */
export function ageFilterPatch(
  view: SidebarView,
  bucket: ViewAgeFilter,
  on: boolean,
): Partial<SidebarView> {
  const next = on
    ? [...new Set([...view.ageFilter, bucket])]
    : view.ageFilter.filter((entry) => entry !== bucket);
  return { ageFilter: next };
}

/** The age-filter patch for the All/None controls. */
export function allAgeFilterPatch(on: boolean): Partial<SidebarView> {
  return { ageFilter: on ? [...VIEW_AGE_FILTERS] : [] };
}

/**
 * The environment-filter patch one checkbox produces. `null` means every
 * environment; selecting every known key collapses back to `null`, clearing
 * them is a real "none", and `__none__` selects environment-less rows.
 */
export function environmentFilterPatch(
  view: SidebarView,
  id: string,
  keys: readonly string[],
  on: boolean,
): Partial<SidebarView> {
  const selected = view.environmentFilter === null ? [...keys] : view.environmentFilter;
  const next = on
    ? [...new Set([...selected, id])]
    : selected.filter((entry) => entry !== id);
  const coversAll = keys.length > 0 && keys.every((key) => next.includes(key));
  return { environmentFilter: coversAll ? null : next };
}

/** The environment-filter patch for the All/None controls. */
export function allEnvironmentFilterPatch(on: boolean): Partial<SidebarView> {
  return { environmentFilter: on ? null : [] };
}

/**
 * The project-filter patch one checkbox produces. `null` means every project;
 * selecting every known key collapses back to `null`, clearing them is a real
 * "none", and `__no_project__` selects threads with no project.
 */
export function projectFilterPatch(
  view: SidebarView,
  id: string,
  keys: readonly string[],
  on: boolean,
): Partial<SidebarView> {
  const selected = view.projectFilter === null ? [...keys] : view.projectFilter;
  const next = on
    ? [...new Set([...selected, id])]
    : selected.filter((entry) => entry !== id);
  const coversAll = keys.length > 0 && keys.every((key) => next.includes(key));
  return { projectFilter: coversAll ? null : next };
}

/** The project-filter patch for the All/None controls. */
export function allProjectFilterPatch(on: boolean): Partial<SidebarView> {
  return { projectFilter: on ? null : [] };
}

/** One home's data needed to enumerate its real collapsible targets. */
export interface CollapsibleHome {
  id: string;
  /** Date buckets only render on standalone chats. */
  isPersonal?: boolean;
  members: readonly PluginSidebarThread[];
  childrenOf: (threadId: string) => readonly string[];
  parentOf: (threadId: string) => string | null;
}

export interface CollapsibleTargets {
  /** Keys held by the collapsed-groups store (pinned, folders, generated). */
  groupKeys: ReadonlySet<string>;
  /** Date keys held by the collapsed-ages store. */
  ageKeys: ReadonlySet<string>;
  /** Threads with children, held by the expanded-parents store. */
  parentIds: ReadonlySet<string>;
}

/**
 * The real collapsible targets a view renders, using the same group keys the
 * renderer derives. Date keys exist only for the Updated grouping and only for
 * buckets that actually appear; generated Status/Environment keys only for
 * their grouping; pinned keys only when a pinned family renders. The flat None
 * grouping renders only child threads, so it holds no section keys at all.
 */
export function ordinaryCollapsibleTargets(
  homes: readonly CollapsibleHome[],
  view: SidebarView,
  options: {
    now: number;
    folderIds: ReadonlySet<string>;
    statusOf: (thread: PluginSidebarThread) => ViewStatusFilter;
    /** Complete-set family aggregates, so a filtered view collapses what it shows. */
    familyFacts?: OrdinaryFamilyFacts | undefined;
  },
): CollapsibleTargets {
  const groupKeys = new Set<string>();
  const ageKeys = new Set<string>();
  const parentIds = new Set<string>();
  for (const home of homes) {
    for (const thread of home.members) {
      if (home.childrenOf(thread.id).length > 0) parentIds.add(thread.id);
    }
    // The flat None grouping draws no folder, date, status or environment
    // heading, so the only collapsible targets it renders are child threads.
    if (view.groupBy === "none") continue;
    const pinnedRoots = new Set<string>();
    const filedRoots = new Set<string>();
    for (const thread of home.members) {
      const root = familyRootId(home.parentOf, thread.id);
      if (thread.isPinned) pinnedRoots.add(root);
      if (thread.sectionId !== null && options.folderIds.has(thread.sectionId)) {
        filedRoots.add(root);
      }
    }
    for (const folderId of options.folderIds) {
      if (home.members.some((thread) => thread.sectionId === folderId)) {
        groupKeys.add(`folder:${home.id}:${folderId}`);
      }
    }
    if (view.groupBy === "workspace") continue;
    // Extra grouping wraps the pooled ordinary section; per-home calls still
    // wrap standalone threads only. Project folders stay unsplit.
    if (home.isPersonal === false) continue;
    const keys = ordinaryFamilyGroupKeys(home.members, view, {
      now: options.now,
      parentOf: home.parentOf,
      statusOf: options.statusOf,
      familyFacts: options.familyFacts,
    });
    for (const thread of home.members) {
      const key = keys.get(thread.id);
      if (key === undefined) continue;
      const root = familyRootId(home.parentOf, thread.id);
      if (pinnedRoots.has(root) || filedRoots.has(root)) continue;
      if (view.groupBy === "updated") {
        ageKeys.add(`age:${home.id}:${key.slice("updated:".length)}`);
      } else {
        groupKeys.add(`group:${home.id}:${key}`);
      }
    }
  }
  return { groupKeys, ageKeys, parentIds };
}

export interface OrdinaryGroup {
  key: string;
  /** Null renders no heading (the workspace/flat view). */
  label: string | null;
  rows: DisplayRow[];
}

export interface OrdinaryGroupFacts {
  now: number;
  parentOf: (threadId: string) => string | null;
  statusOf: (thread: PluginSidebarThread) => ViewStatusFilter;
  /**
   * The home's complete threads, before flatten or collapse. Defaults to the
   * rendered rows, which is exact only when nothing is folded.
   */
  members?: readonly PluginSidebarThread[];
  /**
   * Family aggregates over the complete unfiltered set. When present these are
   * authoritative, so a filter that hides a descendant never changes the
   * family's Updated bucket, Status group or ordering.
   */
  familyFacts?: OrdinaryFamilyFacts | undefined;
}

/**
 * Family facts for one grouping pass, preferring the caller's complete-set
 * aggregates over anything re-derived from the rows that survived filtering.
 */
function resolveFamilyFacts(
  threads: readonly PluginSidebarThread[],
  facts: OrdinaryGroupFacts,
): {
  rootOf: ReadonlyMap<string, string>;
  aggregateOf: ReadonlyMap<string, FamilyAggregate>;
} {
  if (facts.familyFacts !== undefined) return facts.familyFacts;
  const { rootOf, aggregates } = familyAggregates(threads, facts);
  return { rootOf, aggregateOf: aggregates };
}

function groupDefinition(
  view: SidebarView,
  aggregate: FamilyAggregate,
  now: number,
): { key: string; label: string; canonical: number } {
  if (view.groupBy === "updated") {
    const bucket = bucketForTimestamp(aggregate.latestUpdatedAt, now);
    return { key: `updated:${bucket}`, label: bucket, canonical: AGE_GROUPS.indexOf(bucket) };
  }
  if (view.groupBy === "status") {
    return {
      key: `status:${aggregate.status}`,
      label: STATUS_FILTER_LABELS[aggregate.status],
      canonical: VIEW_STATUS_FILTERS.indexOf(aggregate.status),
    };
  }
  const grouped = aggregate.environmentGroup;
  return {
    key: `environment:${grouped.id}`,
    label: grouped.label,
    canonical: aggregate.firstIndex,
  };
}

/**
 * Each thread's automatic group key, by family. The drag reorder uses this so a
 * manual move stays inside one visible group, and `groupOrdinaryRows` uses the
 * same rule so rendering and reordering never disagree.
 */
export function ordinaryFamilyGroupKeys(
  threads: readonly PluginSidebarThread[],
  view: SidebarView,
  facts: OrdinaryGroupFacts,
): ReadonlyMap<string, string> {
  if (view.groupBy === "workspace") {
    return new Map(threads.map((thread) => [thread.id, "__workspace__"]));
  }
  if (view.groupBy === "none") {
    // One flat list: every family shares the single group, so a drag never
    // crosses a visible heading because there is none.
    return new Map(threads.map((thread) => [thread.id, "__flat__"]));
  }
  const { rootOf, aggregateOf: aggregates } = resolveFamilyFacts(threads, facts);
  const keyOfRoot = new Map<string, string>();
  for (const [root, aggregate] of aggregates) {
    keyOfRoot.set(root, groupDefinition(view, aggregate, facts.now).key);
  }
  return new Map(
    threads.map((thread) => [thread.id, keyOfRoot.get(rootOf.get(thread.id)!)!]),
  );
}

/**
 * Group the dated/ordinary rows for the selected grouping. Pinned and folder
 * rows are partitioned by the caller and never reach here. A whole family
 * shares one group so grouping never splits an ancestry: the family's newest
 * member decides the Updated bucket, its strongest resolved status decides the
 * Status group, and its root's environment decides the Environment group.
 *
 * Family facts come from `facts.members` (the home's complete threads), not the
 * rendered rows, so folding or limiting a family never changes its group.
 */
export function groupOrdinaryRows(
  rows: readonly DisplayRow[],
  view: SidebarView,
  facts: OrdinaryGroupFacts,
): OrdinaryGroup[] {
  if (rows.length === 0) {
    // No thread renders no heading in any grouping. A group with nothing under
    // it reads as a bug, so every empty bucket is dropped.
    return [];
  }
  if (view.groupBy === "workspace") {
    return [{ key: "__workspace__", label: null, rows: [...rows] }];
  }
  if (view.groupBy === "none") {
    // One flat list with no heading at all; the caller still sorts whole
    // families by the selected conversation order before this runs.
    return [{ key: "__flat__", label: null, rows: [...rows] }];
  }

  const complete = facts.members ?? rows.map((row) => row.thread);
  const { rootOf, aggregateOf: aggregates } = resolveFamilyFacts(complete, facts);
  interface GroupAccumulator {
    key: string;
    label: string;
    canonical: number;
    latestUpdatedAt: number;
    rows: DisplayRow[];
  }
  const groups = new Map<string, GroupAccumulator>();
  for (const row of rows) {
    const root = rootOf.get(row.thread.id);
    const aggregate =
      root === undefined
        ? {
            status: facts.statusOf(row.thread),
            environmentGroup: environmentGroupOf(row.thread),
            latestUpdatedAt: row.thread.updatedAt,
            firstIndex: 0,
          }
        : aggregates.get(root);
    if (aggregate === undefined) continue;
    const definition = groupDefinition(view, aggregate, facts.now);
    let group = groups.get(definition.key);
    if (group === undefined) {
      group = { ...definition, latestUpdatedAt: 0, rows: [] };
      groups.set(definition.key, group);
    }
    group.rows.push(row);
    group.latestUpdatedAt = Math.max(group.latestUpdatedAt, aggregate.latestUpdatedAt);
  }

  const sorted = [...groups.values()].sort((left, right) => {
    // "Most recent" floats the busiest group first; ties and the default keep
    // the grouping's own canonical order. Status sections never reorder by
    // time, so Unread always stays above Working.
    if (view.sortGroupsBy === "updated" && view.groupBy !== "status") {
      const byTime = right.latestUpdatedAt - left.latestUpdatedAt;
      if (byTime !== 0) return byTime;
    }
    return left.canonical - right.canonical || left.key.localeCompare(right.key);
  });
  // Pooling concatenates homes whose siblings were sorted independently.
  // Compare families across homes inside each bucket as well.
  return sorted.map((group) => ({
    key: group.key,
    label: group.label,
    rows: flattenOrdinaryFamilies(group.rows, view.sortConversationsBy, facts),
  }));
}

/**
 * One flat conversation list, sorted by the selected conversation order. The
 * rows arrive as contiguous families (a root then its rendered descendants), so
 * each chunk is moved whole: sorting never splits a family from its parent or
 * reorders children. Used within ordinary buckets and by the None grouping.
 */
export function flattenOrdinaryFamilies(
  rows: readonly DisplayRow[],
  order: ViewConversationOrder,
  facts: OrdinaryGroupFacts,
): DisplayRow[] {
  if (rows.length <= 1) return [...rows];
  const complete = facts.members ?? rows.map((row) => row.thread);
  const familyFacts =
    facts.familyFacts ?? ordinaryFamilyFacts(complete, facts);
  const compare = familyAwareComparator(order, familyFacts);
  const chunks: DisplayRow[][] = [];
  for (const row of rows) {
    if (row.depth === 0 || chunks.length === 0) chunks.push([row]);
    else chunks[chunks.length - 1]!.push(row);
  }
  chunks.sort((left, right) => compare(left[0]!.thread, right[0]!.thread));
  return chunks.flat();
}

/** Every distinct environment *group* in the loaded ordinary conversations. */
export function environmentFilterOptions(
  threads: readonly PluginSidebarThread[],
): EnvironmentIdentity[] {
  const byId = new Map<string, EnvironmentIdentity>();
  for (const thread of threads) {
    const group = environmentGroupOf(thread);
    if (group.id === NO_ENVIRONMENT_KEY) continue;
    if (!byId.has(group.id)) byId.set(group.id, group);
  }
  return [...byId.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

/**
 * The native projects offered by the switcher, in the sidebar's own project
 * order (the personal project reads as "Chats" there). Every native project is
 * listed, including one with no loaded thread, so an empty project stays
 * selectable and its "No threads" state is reachable. Any id the persisted
 * filter names but the project list no longer has is kept too, labelled by id,
 * so a saved filter can always be cleared. `__no_project__` is listed only when
 * the filter names it.
 */
export function projectFilterOptions(
  threads: readonly PluginSidebarThread[],
  projects: readonly { id: string; name: string; isPersonal?: boolean }[],
  selected: readonly string[] | null = null,
): ProjectIdentity[] {
  const known = projects.map((project) => ({
    id: project.id,
    label: project.isPersonal === true ? "Chats" : project.name,
  }));
  const present = new Set<string>();
  for (const thread of threads) {
    const id = projectKeyOf(thread);
    if (id !== NO_PROJECT_KEY) present.add(id);
  }
  for (const id of selected ?? []) {
    if (id !== NO_PROJECT_KEY) present.add(id);
  }
  const knownIds = new Set(known.map((project) => project.id));
  const unknown = [...present]
    .filter((id) => !knownIds.has(id))
    .sort((left, right) => left.localeCompare(right))
    .map((id) => ({ id, label: id }));
  const noProject =
    selected !== null && selected.includes(NO_PROJECT_KEY)
      ? [{ id: NO_PROJECT_KEY, label: "No project" }]
      : [];
  return [...known, ...noProject, ...unknown];
}

/**
 * The unread ordinary conversations the bulk read marks. Filtered-out rows
 * are included because the scope is the loaded ordinary set, not the visible
 * rows.
 */
export function unreadOrdinaryThreadIds(
  threads: readonly PluginSidebarThread[],
): string[] {
  return threads
    .filter((thread) => !thread.isArchived && thread.isUnread)
    .map((thread) => thread.id);
}
