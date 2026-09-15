import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { activePathIds, flattenShelf, scopeOf, type ProjectSectionData, type DisplayRow } from "./forest";
import { ageGroupKey, type AgeGroup } from "./age-groups";
import {
  UNFILED_GROUP_KEY,
  familyRootId,
  partitionStandaloneRows,
} from "./standalone-groups";
import {
  environmentIdentityOf,
  groupOrdinaryRows,
  ordinaryThreadStatus,
  type OrdinaryGroup,
} from "./sidebar-view";
import type { SidebarView } from "./server";
import { SectionDivider } from "./SectionDivider";
import { SidebarActions } from "./SidebarActions";
import { AnimatedList } from "./AnimatedList";
import type { ThreadShelf } from "./lifecycle";
import type { DropPlacement } from "./thread-order";
import { homeKindOf } from "./membership";
import type { ThreadOwnershipHint } from "./core-ownership";

import { InlineThreadTitle } from "./InlineThreadTitle";
import { PullRequestMark } from "./PullRequestMark";
import { RowContextMenu } from "./RowContextMenu";
import {
  StatusOrTime,
  ThreadAge,
  ThreadLeadStatus,
} from "./StatusSlot";
import { hasStatusGlyph } from "./StatusGlyph";
import { statusSourceForGroup, threadDisplayTitle } from "./inbox";
import type { CoreRowRole } from "./core-ownership";
import { resolveRowStatus, type ThreadStatusKind } from "./status";

/** Everything a row needs that is the same for every row in a section. */
export interface TreeContext {
  visibleById: ReadonlyMap<string, PluginSidebarThread>;
  descendantsById: ReadonlyMap<string, readonly PluginSidebarThread[]>;
  activeThreadId: string | null;
  expandedParents: ReadonlySet<string>;
  expandedAgeGroups: ReadonlySet<string>;
  onToggleAgeGroup: (key: string) => void;
  /** Opens BB's native new-thread composer with no project selected. */
  onNewThread: () => void;
  coordinatorIds: ReadonlySet<string>;
  onMove: (threadId: string) => void;
  canMove: (threadId: string) => boolean;
  onStartProject: (threadId: string) => void;
  canStartProject: (threadId: string) => boolean;
  /** Hand this chat's family to an existing Core (notifies it). */
  onHandOver: (threadId: string) => void;
  /** Associate this chat's family with a Core silently (no notification). */
  onReference: (threadId: string) => void;
  /** Release a Core-owned ordinary chat back to its native home. */
  onRemoveFromCore: (threadId: string) => void;
  /** How a Core-owned row sits under its Core, or null for an ordinary row. */
  coreRoleOf: (threadId: string) => CoreRowRole | null;
  /** Verified ownership, unverified legacy or reference provenance, or null. */
  ownershipHintOf: (threadId: string) => ThreadOwnershipHint | null;
  /** Display name for a Core id, for reference navigation labels. */
  coreNameOf: (coreId: string) => string | null;
  /** Open an existing Core workspace from a non-owning reference marker. */
  onOpenReferenceCore: (coreId: string) => void;
  /** Explicitly confirm an unverified legacy association as Core-owned. */
  onConfirmOwnership: (threadId: string, coreId: string) => void;
  /** Explicitly keep an unverified legacy association as a non-owning link. */
  onKeepAsReference: (threadId: string, coreId: string) => void;
  canAssociate: (threadId: string) => boolean;
  canRemoveFromCore: (threadId: string) => boolean;
  rawById: ReadonlyMap<string, PluginSidebarThread>;
  workspacePaths: ReadonlyMap<string, string | null>;
  /** The host bb runs on; a row only names its host when it differs. */
  primaryHostId: string | null;
  nativeProjects: readonly { id: string; name: string; isPersonal: boolean }[];
  now: number;
  onNavigate: () => void;
  onToggleChildren: (threadId: string) => void;
  focusThread: (threadId: string, fallbackKey: string | null) => void;
  onThreadDragStart: (
    event: ReactPointerEvent<HTMLElement>,
    section: ProjectSectionData,
    thread: PluginSidebarThread,
    shelf: ThreadShelf,
  ) => void;
  consumeSuppressedClick: (threadId: string) => boolean;
  /** The row the pointer is over during a drag, for the placement line. */
  dropTarget: { id: string; placement: DropPlacement } | null;
  draggingThreadId: string | null;
  /** Native folder registry backing standalone folders; empty when unavailable. */
  threadSections: readonly { id: string; name: string }[];
  /** False when the host has no section support: folders and moves hide. */
  sectionsAvailable: boolean;
  /** Persistently collapsed pinned/folder groups; everything defaults open. */
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  /** Open the folder destination dialog for one standalone family. */
  onMoveToFolder: (threadId: string) => void;
  /** Unfile one standalone family back to the dated chats, keeping pin state. */
  onRemoveFromFolder: (threadId: string) => void;
  onRenameFolder: (sectionId: string) => void;
  onDeleteFolder: (sectionId: string) => void;
  /** Native pin flip for one standalone family (root write, family follows). */
  onTogglePin: (threadId: string, pinned: boolean) => void;
  /**
   * Standalone and Core rows offer a pin. An ordinary home writes the family
   * root; a Core home writes only the row's own sibling-ordering pin.
   */
  canPin: (threadId: string) => boolean;
  /** The one persisted view: grouping, conversation order and Show toggles. */
  view: SidebarView;
  /**
   * Exact-generation status over a Core-owned row's subtree, or undefined for
   * an ordinary row. Drawn when the native indicator is silent.
   */
  statusOf: (threadId: string) => ThreadStatusKind | undefined;
  /** The folder or pin header under the pointer during a drag, if any. */
  folderDropTarget: string | null;
}

// Connector geometry, in px from the row's left edge. Ported from Dray's
// sidebar so the rails read the same way, and aligned with the single compact
// left edge used by project headings and thread titles.
export const TREE_RAIL_X = 12;
const STEP = 12;
const ELBOW = 10;
/** Content indent of a depth-1 child, used to align a trailing tree row. */
export const TREE_CHILD_INDENT = TREE_RAIL_X + ELBOW - 8;

export interface LiftedPin {
  section: ProjectSectionData;
  row: DisplayRow;
}

/**
 * Ordinary (non-Core) pinned families, in home order. Rendered as one block
 * between Cores and Projects; each home's own Pinned cluster is omitted.
 */
export function collectLiftedPins(
  sections: readonly ProjectSectionData[],
  ctx: TreeContext,
): LiftedPin[] {
  const knownFolderIds = new Set(ctx.threadSections.map((folder) => folder.id));
  const items: LiftedPin[] = [];
  for (const section of sections) {
    if (homeKindOf(section.id) === "core") continue;
    const rows = flattenShelf(
      section,
      "active",
      (id) => ctx.coordinatorIds.has(id) || ctx.expandedParents.has(id),
    ).filter((row) => !ctx.coordinatorIds.has(row.thread.id));
    const parentOf = (threadId: string): string | null =>
      section.forest.parent.get(threadId) ?? null;
    const pinnedFamilyRoots = new Set<string>();
    for (const row of rows) {
      if (row.thread.isPinned) pinnedFamilyRoots.add(familyRootId(parentOf, row.thread.id));
    }
    const partition = partitionStandaloneRows(rows, {
      parentOf,
      sectionIdOf: (threadId) => {
        const row = rows.find((candidate) => candidate.thread.id === threadId);
        const thread = row?.thread ?? ctx.visibleById.get(threadId);
        return thread?.sectionId ?? null;
      },
      isPinned: (rootId) => pinnedFamilyRoots.has(rootId),
      knownFolderIds,
    });
    for (const row of partition.pinned) items.push({ section, row });
  }
  return items;
}

export function PinnedList({ items, ctx }: { items: readonly LiftedPin[]; ctx: TreeContext }) {
  return (
    <AnimatedList className="flex flex-col">
      {items.map(({ section, row }) => (
        <ThreadRow
          key={row.thread.id}
          row={row}
          section={section}
          shelf="active"
          inShelf={new Set(section.byShelf.active.map((thread) => thread.id))}
          ctx={ctx}
          rootPinned
          inFolderId={null}
        />
      ))}
    </AnimatedList>
  );
}

/**
 * The final tree sibling for a bounded conversation preview. It draws the
 * closing elbow at the conversation level so the rail ends at "Show more (n)"
 * instead of trailing off after the last row.
 */
export function TrailingTreeRow({ children }: { children: ReactNode }) {
  return (
    <li className="relative list-none">
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 h-1/2 w-px bg-sidebar-border"
        style={{ left: TREE_RAIL_X }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute h-px bg-sidebar-border"
        style={{ left: TREE_RAIL_X + 1, top: "50%", width: ELBOW - 2 }}
      />
      {children}
    </li>
  );
}

/** One shelf's rows, flattened with connector data. */
export function ShelfList({
  section,
  shelf,
  ctx,
  keepIds,
  expandIds,
  trailing,
  grouped,
  omitPinned = false,
}: {
  section: ProjectSectionData;
  shelf: ThreadShelf;
  ctx: TreeContext;
  /** Presentation subset for a bounded project preview; omitted means all. */
  keepIds?: ReadonlySet<string>;
  /** Threads force-opened for this render only (a revealed collapsed path). */
  expandIds?: ReadonlySet<string>;
  /** Final tree sibling drawn by the caller (the "Show more" control). */
  trailing?: ReactNode;
  /**
   * Pinned/folder/date grouping applies to an ordinary home (a native Project
   * or Chats). A Core home renders the plain tree: its child pins only order
   * siblings and never lift a family into a separate Pinned group.
   */
  grouped: boolean;
  /** When true, pinned families are rendered in the global Pinned block. */
  omitPinned?: boolean;
}) {
  const hasTrailing = trailing !== undefined && !section.personal;
  const rows = useMemo(
    () =>
      flattenShelf(
        section,
        shelf,
        (id) =>
          ctx.coordinatorIds.has(id) ||
          ctx.expandedParents.has(id) ||
          (expandIds !== undefined && expandIds.has(id)),
        keepIds === undefined ? undefined : (id) => keepIds.has(id),
        hasTrailing ? (id) => ctx.coordinatorIds.has(id) : undefined,
      ).filter(
        (row) =>
          !ctx.coordinatorIds.has(row.thread.id) &&
          (keepIds === undefined || keepIds.has(row.thread.id)),
      ),
    [ctx.coordinatorIds, ctx.expandedParents, expandIds, hasTrailing, keepIds, section, shelf],
  );
  const inShelf = useMemo(
    () =>
      new Set(
        section.byShelf[shelf]
          .filter((thread) => keepIds === undefined || keepIds.has(thread.id))
          .map((thread) => thread.id),
      ),
    [keepIds, section, shelf],
  );
  // The selected thread's ancestor path, used to tint only the rails that lead
  // from the project down to the selected row (including nested descendants),
  // never every rail in the subtree.
  const railPath = useMemo(() => {
    if (!(shelf === "active")) return null;
    const chain = activePathIds(section, ctx.activeThreadId, ctx.coordinatorIds);
    if (chain.length === 0 || chain[chain.length - 1] !== ctx.activeThreadId) return null;
    const index = new Map(rows.map((row, position) => [row.thread.id, position]));
    const activeIndex = index.get(ctx.activeThreadId);
    if (activeIndex === undefined) return null;
    // Row depth counts the Project Manager as depth 0 even though its heading
    // stands in for that row, so a direct conversation sits at depth 1.
    const depth = rows[activeIndex]!.depth;
    const ancestorIndex: number[] = [];
    let cursor: string | null = ctx.activeThreadId;
    let level = depth - 1;
    while (cursor !== null && level >= 0) {
      cursor = section.forest.parent.get(cursor) ?? null;
      ancestorIndex[level] = cursor === null ? -1 : index.get(cursor) ?? -1;
      level -= 1;
    }
    for (let fill = level; fill >= 0; fill -= 1) ancestorIndex[fill] = -1;
    return { path: new Set(chain), activeIndex, depth, ancestorIndex };
  }, [ctx.activeThreadId, ctx.coordinatorIds, rows, section, shelf]);
  const railLevels = useMemo(() => {
    const map = new Map<string, ReadonlySet<number>>();
    if (railPath === null) return map;
    const { activeIndex, depth, ancestorIndex } = railPath;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const levels = new Set<number>();
      const own = row.depth - 1;
      for (let level = 0; level < own; level += 1) {
        if (level < depth && ancestorIndex[level]! < i && i <= activeIndex) levels.add(level);
      }
      if (own >= 0 && own < depth && ancestorIndex[own]! < i && i <= activeIndex) {
        levels.add(own);
      }
      if (railPath.path.has(row.thread.id) && row.depth < depth) levels.add(row.depth);
      map.set(row.thread.id, levels);
    }
    return map;
  }, [railPath, rows]);
  const grouping = grouped && shelf === "active";
  // Native facts for family assignment: the row's own thread first, the
  // visible feed as fallback for roots outside a bounded render.
  const sectionIdOf = useCallback(
    (threadId: string): string | null => {
      const row = rows.find((candidate) => candidate.thread.id === threadId);
      const thread = row?.thread ?? ctx.visibleById.get(threadId);
      return thread?.sectionId ?? null;
    },
    [ctx.visibleById, rows],
  );
  const pinnedOf = useCallback(
    (threadId: string): boolean => {
      const row = rows.find((candidate) => candidate.thread.id === threadId);
      const thread = row?.thread ?? ctx.visibleById.get(threadId);
      return thread?.isPinned ?? false;
    },
    [ctx.visibleById, rows],
  );
  const knownFolderIds = useMemo(
    () => new Set(ctx.threadSections.map((folder) => folder.id)),
    [ctx.threadSections],
  );
  const parentOf = useCallback(
    (threadId: string): string | null => section.forest.parent.get(threadId) ?? null,
    [section],
  );
  // A pin on any family member lifts the whole family into this home's Pinned
  // group, so a child's native pin reads as the family's. The family root is
  // still the write target.
  const pinnedFamilyRoots = useMemo(() => {
    const pinned = new Set<string>();
    if (!grouping) return pinned;
    for (const row of rows) {
      if (pinnedOf(row.thread.id)) pinned.add(familyRootId(parentOf, row.thread.id));
    }
    return pinned;
  }, [grouping, parentOf, pinnedOf, rows]);
  // The pin label and toggle follow the family's lifted native state, never the
  // cluster the row renders in.
  const rootPinnedOf = useCallback(
    (threadId: string): boolean => pinnedFamilyRoots.has(familyRootId(parentOf, threadId)),
    [parentOf, pinnedFamilyRoots],
  );
  const familyPinned = useCallback(
    (rootId: string): boolean => pinnedFamilyRoots.has(rootId),
    [pinnedFamilyRoots],
  );
  const partition = useMemo(
    () =>
      grouping
        ? partitionStandaloneRows(rows, {
            parentOf,
            sectionIdOf,
            isPinned: familyPinned,
            knownFolderIds,
          })
        : null,
    [familyPinned, grouping, knownFolderIds, parentOf, rows, sectionIdOf],
  );
  // The selected grouping only orders the dated rows after pins and folders.
  // A whole family shares a group, so grouping never splits an ancestry. The
  // family facts come from the home's complete members, so folding a parent or
  // bounding the preview never changes which group its family lands in.
  const groups = useMemo<OrdinaryGroup[]>(() => {
    if (!grouping || partition === null) {
      return [{ key: shelf, label: null, rows }];
    }
    // Date buckets belong on standalone chats. Inside a native Project they
    // leave empty "Last 7 days" / "Last 30 days" headers over a short list, so
    // dated rows stay a flat recency list — the way Cursor lists project chats.
    if (!section.personal && ctx.view.groupBy === "updated") {
      return [{ key: `${shelf}:flat`, label: null, rows: partition.dated }];
    }
    return groupOrdinaryRows(partition.dated, ctx.view, {
      now: ctx.now,
      parentOf,
      statusOf: ordinaryThreadStatus,
      environmentOf: environmentIdentityOf,
      members: section.members,
    });
  }, [partition, rows, grouping, ctx.now, ctx.view, parentOf, shelf, section.members, section.personal]);
  const pinnedKey = `pinned:${section.id}`;
  const pinnedOpen = !ctx.collapsedGroups.has(pinnedKey);
  const folderKey = (folderId: string) => `folder:${section.id}:${folderId}`;
  // Rows by folder in native registry order. Chats owns the user-folder
  // registry, so an empty folder still renders once there; Core-claimed native
  // sections are omitted from that registry so they cannot copy a Core family.
  // A native Project home renders only the folders that actually hold one of
  // its families, so a folder never repeats across every home.
  const folderRowsById = useMemo(
    () => new Map((partition?.folders ?? []).map((folder) => [folder.sectionId, folder.rows] as const)),
    [partition],
  );
  const foldersForHome = useMemo(
    () => (section.personal ? ctx.threadSections : ctx.threadSections.filter((folder) => folderRowsById.has(folder.id))),
    [ctx.threadSections, folderRowsById, section.personal],
  );
  const unfileActive =
    ctx.folderDropTarget === `folder:${UNFILED_GROUP_KEY}` ||
    ctx.folderDropTarget === "pin:unpin";
  const renderGroup = (group: OrdinaryGroup, index: number) => {
    const isDate = group.key.startsWith("updated:") && group.label !== null;
    const isLast = index === groups.length - 1;
    const collapseKey =
      group.label === null
        ? null
        : isDate
          ? ageGroupKey(section.id, group.label as AgeGroup)
          : `group:${section.id}:${group.key}`;
    const open =
      collapseKey === null
        ? true
        : isDate
          ? ctx.expandedAgeGroups.has(collapseKey)
          : !ctx.collapsedGroups.has(collapseKey);
    return (
      <div key={group.key} className={group.label ? "mt-2 first:mt-0" : undefined}>
        {group.label !== null && collapseKey !== null ? (
          <div
            data-folder-target={isDate ? UNFILED_GROUP_KEY : undefined}
            data-pin-target={isDate ? "unpin" : undefined}
            className={cn("rounded", isDate && unfileActive && "bg-primary/10 ring-1 ring-primary/40")}
          >
            <SectionDivider
              label={group.label}
              open={open}
              onToggle={
                isDate
                  ? () => ctx.onToggleAgeGroup(collapseKey)
                  : () => ctx.onToggleGroup(collapseKey)
              }
              onNewThread={group.label === "Today" ? ctx.onNewThread : undefined}
              shelfKey={collapseKey}
            />
          </div>
        ) : null}
        {open ? (
          <AnimatedList className="flex flex-col">
            {group.rows.map((row) => (
              <ThreadRow
                key={row.thread.id}
                row={row}
                section={section}
                shelf={shelf}
                inShelf={inShelf}
                ctx={ctx}
                rootPinned={rootPinnedOf(row.thread.id)}
                inFolderId={null}
                activeRailLevels={railLevels.get(row.thread.id)}
                activeElbow={railPath?.path.has(row.thread.id) ?? false}
              />
            ))}
            {hasTrailing && isLast ? <TrailingTreeRow>{trailing}</TrailingTreeRow> : null}
          </AnimatedList>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {grouping && partition !== null ? (
        <>
      {!omitPinned && partition.pinned.length > 0 ? (
        <div className="mt-2 first:mt-0">
          <div
            data-pin-target="pin"
            className={cn(
              "rounded",
              ctx.folderDropTarget === "pin:pin" && "bg-primary/10 ring-1 ring-primary/40",
            )}
          >
            <SectionDivider
              label="Pinned"
              open={pinnedOpen}
              onToggle={() => ctx.onToggleGroup(pinnedKey)}
              shelfKey={pinnedKey}
            />
          </div>
          {pinnedOpen ? (
            <AnimatedList className="flex flex-col">
              {partition.pinned.map((row) => (
                <ThreadRow
                  key={row.thread.id}
                  row={row}
                  section={section}
                  shelf={shelf}
                  inShelf={inShelf}
                  ctx={ctx}
                  rootPinned
                  inFolderId={null}
                  activeRailLevels={railLevels.get(row.thread.id)}
                  activeElbow={railPath?.path.has(row.thread.id) ?? false}
                />
              ))}
            </AnimatedList>
          ) : null}
        </div>
      ) : null}
      {foldersForHome.map((folder) => {
        const key = folderKey(folder.id);
        const open = !ctx.collapsedGroups.has(key);
        const rows = folderRowsById.get(folder.id) ?? [];
        return (
          <div key={folder.id} className="mt-2 first:mt-0">
            <FolderDivider
              sectionId={folder.id}
              name={folder.name}
              open={open}
              onToggle={() => ctx.onToggleGroup(key)}
              shelfKey={key}
              dropActive={ctx.folderDropTarget === `folder:${folder.id}`}
              managing={section.personal}
              onRename={() => ctx.onRenameFolder(folder.id)}
              onDelete={() => ctx.onDeleteFolder(folder.id)}
            />
            {open && rows.length > 0 ? (
              <AnimatedList className="flex flex-col">
                {rows.map((row) => (
                  <ThreadRow
                    key={row.thread.id}
                    row={row}
                    section={section}
                    shelf={shelf}
                    inShelf={inShelf}
                    ctx={ctx}
                    rootPinned={rootPinnedOf(row.thread.id)}
                    inFolderId={folder.id}
                    activeRailLevels={railLevels.get(row.thread.id)}
                    activeElbow={railPath?.path.has(row.thread.id) ?? false}
                  />
                ))}
              </AnimatedList>
            ) : null}
          </div>
        );
      })}
        </>
      ) : null}
      {groups.map(renderGroup)}
    </>
  );
}

/** A named native folder: collapse always, rename and delete only in Chats. */
function FolderDivider({ sectionId, name, open, onToggle, shelfKey, dropActive, managing, onRename, onDelete }: {
  sectionId: string;
  name: string;
  open: boolean;
  onToggle: () => void;
  shelfKey: string;
  dropActive: boolean;
  /** True in the home that owns the global registry (Chats). */
  managing: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <SidebarActions label={name} onHold={onToggle} actions={[
      { label: open ? "Collapse folder" : "Expand folder", run: onToggle },
      ...(managing ? [
        { label: "Rename folder", run: onRename },
        { label: "Delete folder", run: onDelete, destructive: true },
      ] : []),
    ]}>
      <div
        data-folder-target={sectionId}
        className={cn("rounded", dropActive && "bg-primary/10 ring-1 ring-primary/40")}
      >
        <div className="group/section flex items-center gap-1 pl-3 pr-1.5">
          <button
            type="button"
            data-shelf-toggle={shelfKey}
            aria-label={name}
            aria-expanded={open}
            onClick={onToggle}
            className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded py-0.5 text-xs font-medium text-muted-foreground/55 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
          >
            <Icon name={open ? "FolderOpen" : "Folder"} className="size-3 shrink-0" />
            <span className="truncate">{name}</span>
          </button>
        </div>
      </div>
    </SidebarActions>
  );
}

function ThreadRow({
  row,
  section,
  shelf,
  inShelf,
  ctx,
  rootPinned,
  inFolderId,
  activeRailLevels,
  activeElbow,
}: {
  row: ReturnType<typeof flattenShelf>[number];
  section: ProjectSectionData;
  shelf: ThreadShelf;
  inShelf: ReadonlySet<string>;
  ctx: TreeContext;
  /** The family root's native pin state; the toggle flips the root. */
  rootPinned: boolean;
  /** The native folder this row renders inside, if any. */
  inFolderId: string | null;
  activeRailLevels?: ReadonlySet<number> | undefined;
  activeElbow?: boolean;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(row.thread.id);
  const [isRenaming, setIsRenaming] = useState(false);

  const { thread, depth, guides, opens } = row;
  const isActive = thread.id === ctx.activeThreadId;
  const scope = scopeOf(section, thread.id);
  const title = threadDisplayTitle(thread);
  const native = ctx.rawById.get(thread.id) ?? thread;
  const workspacePath = native.environment?.id ? ctx.workspacePaths.get(native.environment.id) : null;
  // A real workspace label is the environment's own name, else the last segment
  // of its resolved path. BB's internal personal workspaces use a raw thr_/env_
  // id as that segment; an id is never a directory name, so it is dropped and
  // the machine stands in below instead. The label is always shown, even when
  // it repeats the project heading, so a row never reads as blank.
  const usableLabel = (value: string | null): string | null =>
    value !== null && value !== "" && !/^(thr|env)_[a-z0-9]+$/i.test(value) ? value : null;
  const nameLabel = native.environment?.name?.trim() || null;
  const pathLabel = workspacePath
    ? workspacePath.split(/[\\/]/).filter(Boolean).at(-1)?.trim() ?? null
    : null;
  const workspace = usableLabel(nameLabel) ?? usableLabel(pathLabel);
  const branch = native.environment?.branchName?.trim() || null;
  const hostName = native.host?.name?.trim() || null;
  // Name the machine when a thread has no workspace or branch (a personal chat,
  // say). A remote host is named even when a branch exists, so a row never
  // loses the machine it actually runs on.
  const remoteHost =
    native.host && native.host.id !== ctx.primaryHostId ? `Host: ${native.host.name}` : null;
  const location =
    remoteHost ?? (workspace === null && branch === null && hostName ? `Host: ${hostName}` : null);
  const secondary = [
    ctx.view.show.environment ? workspace : null,
    ctx.view.show.branch ? branch : null,
    ctx.view.show.host ? location : null,
  ].filter(Boolean).join(" · ");
  const secondaryTitle = [
    ctx.view.show.environment && workspace !== null ? workspacePath : null,
    ctx.view.show.branch ? branch : null,
    ctx.view.show.host ? location : null,
  ].filter(Boolean).join(" · ");
  // The resting slot speaks for the whole subtree, so a collapsed parent still
  // shows a running or attention-seeking descendant instead of hiding it.
  const statusThread = statusSourceForGroup(
    thread,
    ctx.descendantsById.get(thread.id) ?? [],
  );
  const isDropTarget = ctx.dropTarget?.id === thread.id;
  const coreRole = ctx.coreRoleOf(thread.id);
  const hint = ctx.ownershipHintOf(thread.id);
  // A reference is a non-owning link. Its marker offers the existing Core
  // workspace; opening it changes no ownership, home or wake state.
  const referenceOpeners =
    hint?.kind === "reference"
      ? hint.coreIds.map((coreId) => {
          const name = ctx.coreNameOf(coreId);
          return {
            coreId,
            label:
              hint.coreIds.length === 1
                ? `Open referencing Core${name ? ` (${name})` : ""}`
                : `Open Core ${name ?? coreId}`,
          };
        })
      : undefined;
  const isCoreHome = homeKindOf(section.id) === "core";
  // A pin is offered in an ordinary home and a Core home. An ordinary home
  // lifts the whole family (root write); a Core home writes only this row's own
  // native flag, so it just orders siblings and never files or lifts a family.
  const pinnedCapable = ctx.canPin(thread.id);
  const rowPinned = isCoreHome ? native.isPinned : rootPinned;
  // A Core row whose exact generation failed, awaits review or is queued draws
  // that status when it is stronger than the native indicator. The native
  // indicator keeps its own richer glyph and label when it wins or ties. One
  // precedence decides both the glyph and the accessible label.
  const rowStatus = resolveRowStatus({
    indicator: statusThread.indicator,
    indicatorLabel: statusThread.indicatorLabel,
    isUnread: statusThread.isUnread,
    hasGlyph: hasStatusGlyph(statusThread.indicator),
    exactStatus: ctx.statusOf(thread.id),
  });
  const exactStatus = ctx.statusOf(thread.id);

  const children = (section.forest.children.get(thread.id) ?? []).filter(
    (child) => inShelf.has(child.id),
  );
  const hasChildren = children.length > 0;
  const expanded = hasChildren && ctx.expandedParents.has(thread.id);

  const nativeParent =
    thread.parentThreadId === null
      ? undefined
      : ctx.visibleById.get(thread.parentThreadId);
  // A coordinator is represented by the project heading, not a row, so an
  // excluded coordinator must not resurface as a detached-parent link.
  const detachedParent =
    depth === 0 &&
    nativeParent !== undefined &&
    !inShelf.has(nativeParent.id) &&
    !ctx.coordinatorIds.has(nativeParent.id)
      ? nativeParent
      : null;



  const open = (
    event: Pick<
      ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
      "preventDefault" | "metaKey" | "ctrlKey"
    >,
  ) => {
    event.preventDefault();
    actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
    ctx.onNavigate();
  };

  const handlePointerDown: PointerEventHandler<HTMLElement> = (event) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") return;
    splitProps.onPointerDown?.(event);
    ctx.onThreadDragStart(event, section, thread, shelf);
  };

  const ownRail = TREE_RAIL_X + (depth - 1) * STEP;
  const parentCarriesOn = guides[depth - 1] ?? false;
  const indent = depth === 0 ? 0 : ownRail + ELBOW - 8;
  // Only the rails that carry the selected thread's path take the selection
  // tone; the rest keep the quiet border colour.
  const railClass = (level: number) =>
    activeRailLevels?.has(level) ? "bg-sidebar-foreground/45" : "bg-sidebar-border";
  const elbowClass = activeElbow ? "bg-sidebar-foreground/45" : "bg-sidebar-border";

  return (
    <li
      data-dragging={ctx.draggingThreadId === thread.id ? "true" : undefined}
      className={cn(
        "relative list-none transition-opacity duration-150 ease-out motion-reduce:transition-none",
        ctx.draggingThreadId === thread.id && "opacity-50",
      )}
    >
      {detachedParent !== null ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            actions.open(detachedParent.id);
            ctx.onNavigate();
          }}
          aria-label={`Parent thread: ${threadDisplayTitle(detachedParent)}`}
          className="flex max-w-full items-center gap-1 truncate py-0.5 pl-6 pr-2 text-xs leading-none text-muted-foreground/80 hover:text-foreground max-md:pointer-coarse:min-h-9"
        >
          <Icon name="CornerDownRight" className="size-3 shrink-0" />
          <span className="truncate">{threadDisplayTitle(detachedParent)}</span>
        </button>
      ) : null}

      <RowContextMenu
        thread={thread}
        onToggleChildren={hasChildren ? () => ctx.onToggleChildren(thread.id) : undefined}
        expanded={expanded}
        onMove={ctx.canMove(thread.id) ? () => ctx.onMove(thread.id) : undefined}
        onStartProject={ctx.canStartProject(thread.id) ? () => ctx.onStartProject(thread.id) : undefined}
        onHandOver={ctx.canAssociate(thread.id) ? () => ctx.onHandOver(thread.id) : undefined}
        onReference={ctx.canAssociate(thread.id) ? () => ctx.onReference(thread.id) : undefined}
        onRemoveFromCore={coreRole === "owned-chat" && ctx.canRemoveFromCore(thread.id) ? () => ctx.onRemoveFromCore(thread.id) : undefined}
        coreRole={coreRole}
        ownershipHint={hint}
        referenceOpeners={referenceOpeners}
        onOpenReferenceCore={ctx.onOpenReferenceCore}
        onConfirmOwnership={hint?.kind === "unverified" ? () => ctx.onConfirmOwnership(thread.id, hint.coreId) : undefined}
        onKeepAsReference={hint?.kind === "unverified" ? () => ctx.onKeepAsReference(thread.id, hint.coreId) : undefined}
        onTogglePin={pinnedCapable ? () => ctx.onTogglePin(thread.id, !rowPinned) : undefined}
        isPinned={rowPinned}
        pinSibling={isCoreHome}
        onMoveToFolder={!isCoreHome && pinnedCapable && ctx.sectionsAvailable ? () => ctx.onMoveToFolder(thread.id) : undefined}
        onRemoveFromFolder={!isCoreHome && inFolderId !== null ? () => ctx.onRemoveFromFolder(thread.id) : undefined}
        onRename={() => setIsRenaming(true)}
        onOpen={() => ctx.onNavigate()}
      >
        <div
          data-thread-row=""
          data-thread-row-id={thread.id}
          data-thread-shelf={shelf}
          data-reorder-id={thread.id}
          data-reorder-kind="thread"
          data-reorder-scope={scope}
          className={cn(
            "group/row relative flex items-center gap-1.5 rounded-md pl-3 pr-1 transition-colors",
            secondary ? "ps-workspace-row my-1 py-1" : "py-0.5",
            "min-h-7 max-md:pointer-coarse:min-h-11",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60",
            !isActive && layout !== null && "bg-sidebar-accent/30",
            shelf === "settled" &&
              !isActive &&
              "text-muted-foreground/70 hover:bg-sidebar-accent/25 hover:text-muted-foreground",
          )}
        >
          {isDropTarget ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-1 z-20 h-0.5 rounded-full bg-primary",
                ctx.dropTarget?.placement === "before" ? "-top-px" : "-bottom-px",
              )}
            />
          ) : null}
          <a
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            data-thread-focus-id={thread.id}
            data-thread-shelf={shelf}
              href="#"
            aria-label={`${title}${isActive ? ", selected" : ""}`}
            aria-current={isActive ? "true" : undefined}
            aria-expanded={hasChildren ? expanded : undefined}
            aria-description={hasChildren ? "Hold to expand or collapse children. Swipe left for actions, or use the Actions control or Shift+F10." : "Hold for actions, or use the Actions control or Shift+F10."}
            {...splitProps}
            draggable={false}
            onPointerDown={handlePointerDown}
            onClick={(event) => {
              event.preventDefault();
              if (ctx.consumeSuppressedClick(thread.id)) return;
              open(event);
            }}
            className="absolute inset-0 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
          />

          {/* Ancestor pass-through rails. */}
          {guides.slice(0, -1).map(
            (openGuide, level) =>
              openGuide && (
                <span
                  key={level}
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-0 -bottom-px w-px",
                    railClass(level),
                  )}
                  style={{ left: TREE_RAIL_X + level * STEP }}
                />
              ),
          )}
          {depth > 0 ? (
            <>
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-0 w-px",
                  railClass(depth - 1),
                )}
                style={{
                  left: ownRail,
                  height: parentCarriesOn ? "calc(100% + 1px)" : "50%",
                }}
              />
              <span
                aria-hidden
                className={cn("pointer-events-none absolute h-px", elbowClass)}
                style={{ left: ownRail + 1, top: "50%", width: ELBOW - 2 }}
              />
            </>
          ) : null}
          {opens ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute -bottom-px w-px",
                railClass(depth),
              )}
              style={{ left: TREE_RAIL_X + depth * STEP, top: "50%" }}
            />
          ) : null}

          {indent > 0 ? <span aria-hidden style={{ width: indent }} className="shrink-0" /> : null}

          {hasChildren ? (
            <button
              type="button"
              aria-label={`${expanded ? "Hide" : "Show"} ${children.length} child ${children.length === 1 ? "thread" : "threads"}`}
              aria-expanded={expanded}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                ctx.onToggleChildren(thread.id);
              }}
              style={{ left: indent }}
              className="ps-child-toggle absolute top-1/2 z-10 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:opacity-100"
            >
              <Icon name={expanded ? "ChevronDown" : "ChevronRight"} className="size-3" />
            </button>
          ) : null}

          <span className={cn(
            "ps-status-slot pointer-events-none relative flex w-4 shrink-0 items-center justify-center",
            hasChildren && "group-hover/row:opacity-0 group-focus-within/row:opacity-0 max-md:pointer-coarse:opacity-0",
          )}>
            <ThreadLeadStatus
              thread={statusThread}
              exactStatus={exactStatus}
              label={rowStatus.label}
            />
          </span>

          {coreRole === "worker" ? (
            <span
              role="img"
              aria-label="Assigned Worker"
              title="Assigned Worker"
              className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/80"
            >
              <Icon name="UserRoundPlus" className="size-3.5" />
            </span>
          ) : coreRole === "owned-chat" ? (
            <span
              role="img"
              aria-label="Core-owned chat"
              title="Core-owned chat"
              className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/60"
            >
              <Icon name="MessageSquare" className="size-3.5" />
            </span>
          ) : hint?.kind === "unverified" ? (
            <span
              role="img"
              aria-label="Unverified Core association"
              title="An unverified legacy association. Not owned; confirm ownership or keep it as a reference."
              className="flex size-3.5 shrink-0 items-center justify-center text-warning-text"
            >
              <Icon name="CircleQuestion" className="size-3.5" />
            </span>
          ) : hint?.kind === "reference" ? (
            <span
              role="img"
              aria-label="Core reference"
              title={`Referenced by ${hint.coreIds.length} Core${hint.coreIds.length === 1 ? "" : "s"}. This is not ownership and does not change its home.`}
              className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/50"
            >
              <Icon name="ExternalLink" className="size-3.5" />
            </span>
          ) : null}

          {ctx.view.show.pr ? <PullRequestMark threadId={thread.id} /> : null}

          <div className={cn("flex min-w-0 flex-1 flex-col items-start", secondary ? "gap-0 leading-none" : "gap-0")}>
          <InlineThreadTitle
            thread={thread}
            editing={isRenaming}
            onEditingChange={setIsRenaming}
            onPointerDown={handlePointerDown}
            onClick={(event) => {
              if (event.detail > 1) {
                event.preventDefault();
                return;
              }
              if (ctx.consumeSuppressedClick(thread.id)) return;
              open(event);
            }}
            className={cn(
              "ps-thread-title w-full min-w-0 truncate text-sm",
              thread.isUnread && "font-medium",
            )}
          />
          {secondary ? <span className="ps-thread-info mt-px block w-full truncate text-2xs leading-none text-muted-foreground/55" title={secondaryTitle} aria-label={secondaryTitle}><span className="ps-secondary-desktop">{secondary}</span><span className="ps-secondary-mobile hidden">{[ctx.view.show.environment ? workspace : null, ctx.view.show.branch ? branch : null].filter(Boolean).join(" · ")}</span></span> : null}
          {location && ctx.view.show.host ? <span className="ps-thread-location hidden text-xs text-muted-foreground">{location}</span> : null}
          <span className="ps-mobile-status hidden text-xs text-muted-foreground"><StatusOrTime thread={statusThread} now={ctx.now} showTime={ctx.view.show.updated} /></span>
          </div>

          <div className="relative ml-auto flex min-w-6 shrink-0 items-center justify-end pl-1">
            <span className="ps-thread-time pointer-events-none tabular-nums text-xs text-muted-foreground/80 group-hover/row:invisible group-focus-within/row:invisible max-md:pointer-coarse:visible">
              {ctx.view.show.updated ? <ThreadAge thread={statusThread} now={ctx.now} /> : null}
            </span>
            <span className="absolute inset-y-0 right-0 z-20 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-within:opacity-100 max-md:pointer-coarse:relative max-md:pointer-coarse:opacity-100">
              {pinnedCapable ? (
                <button
                  type="button"
                  aria-label={rowPinned ? "Unpin" : "Pin"}
                  title={rowPinned ? "Unpin" : "Pin"}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    ctx.onTogglePin(thread.id, !rowPinned);
                  }}
                  className="pointer-events-auto flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                >
                  <Icon name={rowPinned ? "PinOff" : "Pin"} className="size-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Archive"
                title="Archive"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void actions.archive(thread.id);
                }}
                className="pointer-events-auto flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
              >
                <Icon name="Archive" className="size-3.5" />
              </button>
            </span>
          </div>
        </div>
      </RowContextMenu>

    </li>
  );
}
