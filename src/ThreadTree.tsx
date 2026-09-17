import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type ReactNode,
  Fragment,
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
  viewHasActiveFilters,
  type OrdinaryGroup,
} from "./sidebar-view";
import type { SidebarView } from "./server";
import { SectionDivider } from "./SectionDivider";
import { SidebarActions } from "./SidebarActions";
import { AnimatedList } from "./AnimatedList";
import type { ThreadShelf } from "./lifecycle";
import type { DropPlacement } from "./thread-order";
import { InlineThreadTitle } from "./InlineThreadTitle";
import { PullRequestMark } from "./PullRequestMark";
import { RowContextMenu } from "./RowContextMenu";
import {
  StatusOrTime,
  ThreadAge,
  ThreadLeadStatus,
} from "./StatusSlot";
import { hasStatusGlyph } from "./StatusGlyph";
import {
  CONVERSATION_PAGE_SIZE,
  DEFAULT_INACTIVE_CONVERSATIONS,
  pageGroupRows,
} from "./conversations";
import { statusSourceForGroup, threadDisplayTitle } from "./inbox";
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
  /** Persistently collapsed pinned/folder groups; everything defaults open. */
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  /** Unfile one standalone family back to the dated chats, keeping pin state. */
  onRemoveFromFolder: (threadId: string) => void;
  onRenameFolder: (sectionId: string) => void;
  onDeleteFolder: (sectionId: string) => void;
  /** Native pin flip for one standalone family (root write, family follows). */
  onTogglePin: (threadId: string, pinned: boolean) => void;
  /**
   * Standalone and project rows offer a pin. An ordinary home writes the family
   * root.
   */
  canPin: (threadId: string) => boolean;
  /** The one persisted view: grouping, conversation order and Show toggles. */
  view: SidebarView;
  /**
   * Strongest status over a row's rendered subtree, or undefined. Drawn when
   * the native indicator is silent.
   */
  statusOf: (threadId: string) => ThreadStatusKind | undefined;
  /** The folder or pin header under the pointer during a drag, if any. */
  folderDropTarget: string | null;
}

// Tree coordinates are px from the row's left border. Headings and thread
// rows share `pl-3` (12px) then a 16px status slot; rails run through that
// slot's centre so a parent disc, its hover chevron, and the line to its
// children occupy one column. Each nested level steps by one slot.
const ROW_PAD = 12;
const SLOT = 16;
const STEP = 16;
const ELBOW = STEP;
/** Centre of the depth-0 status slot. */
export const TREE_RAIL_X = ROW_PAD + SLOT / 2;
/** Depth-1 spacer before the status slot; also the project-child indent. */
export const TREE_CHILD_INDENT = STEP;

export interface LiftedPin {
  section: ProjectSectionData;
  row: DisplayRow;
}

/**
 * Ordinary pinned families, in native home order. Rendered as one block above
 * Projects; each home's own Pinned cluster is omitted. The Projects overlay
 * order is ignored, so dragging projects never reshuffles this list.
 */
export function collectLiftedPins(
  sections: readonly ProjectSectionData[],
  ctx: TreeContext,
  homeOrder: readonly string[] = sections.map((section) => section.id),
): LiftedPin[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const seen = new Set<string>();
  const ordered: ProjectSectionData[] = [];
  for (const id of homeOrder) {
    const section = byId.get(id);
    if (section === undefined || seen.has(id)) continue;
    seen.add(id);
    ordered.push(section);
  }
  for (const section of sections) {
    if (seen.has(section.id)) continue;
    seen.add(section.id);
    ordered.push(section);
  }
  const knownFolderIds = new Set(ctx.threadSections.map((folder) => folder.id));
  const items: LiftedPin[] = [];
  for (const section of ordered) {
    const rows = flattenShelf(
      section,
      "active",
      (id) => ctx.expandedParents.has(id),
    );
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
  firstGroupTools,
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
   * or Chats).
   */
  grouped: boolean;
  /** When true, pinned families are rendered in the global Pinned block. */
  omitPinned?: boolean;
  /** Tools on the first bucket heading, or a static fallback heading when no bucket renders. */
  firstGroupTools?: ReactNode;
}) {
  const hasTrailing = trailing !== undefined && !section.personal;
  const [childPages, setChildPages] = useState<ReadonlyMap<string, number>>(() => new Map());
  const childLimitOf = useCallback(
    (threadId: string) => {
      if (expandIds !== undefined && expandIds.has(threadId)) return Number.POSITIVE_INFINITY;
      return childPages.get(threadId) ?? DEFAULT_INACTIVE_CONVERSATIONS;
    },
    [childPages, expandIds],
  );
  const rows = useMemo(
    () =>
      flattenShelf(
        section,
        shelf,
        (id) =>
          ctx.expandedParents.has(id) ||
          (expandIds !== undefined && expandIds.has(id)),
        keepIds === undefined ? undefined : (id) => keepIds.has(id),
        undefined,
        childLimitOf,
      ).filter(
        (row) => keepIds === undefined || keepIds.has(row.thread.id),
      ),
    [childLimitOf, ctx.expandedParents, expandIds, keepIds, section, shelf],
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
    const chain = activePathIds(section, ctx.activeThreadId);
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
  }, [ctx.activeThreadId, rows, section, shelf]);
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
  const bumpChildPage = useCallback((parentId: string) => {
    setChildPages((current) => {
      const next = new Map(current);
      next.set(
        parentId,
        (next.get(parentId) ?? DEFAULT_INACTIVE_CONVERSATIONS) + CONVERSATION_PAGE_SIZE,
      );
      return next;
    });
  }, []);
  const renderThreadRows = (
    list: readonly DisplayRow[],
    options: {
      rootPinned?: boolean | ((threadId: string) => boolean);
      inFolderId?: string | null;
      environmentGroupLabel?: string | null;
    } = {},
  ) => {
    const lastChild = new Map<string, string>();
    for (const row of list) {
      const parentId = parentOf(row.thread.id);
      if (parentId !== null) lastChild.set(parentId, row.thread.id);
    }
    const moreAfter = new Map<string, { parentId: string; remaining: number }>();
    for (const [parentId, lastId] of lastChild) {
      const all = (section.forest.children.get(parentId) ?? []).filter((child) =>
        inShelf.has(child.id),
      );
      const remaining = Math.max(0, all.length - childLimitOf(parentId));
      if (remaining > 0) moreAfter.set(lastId, { parentId, remaining });
    }
    return list.map((row) => {
      const more = moreAfter.get(row.thread.id);
      const rootPinned =
        typeof options.rootPinned === "function"
          ? options.rootPinned(row.thread.id)
          : (options.rootPinned ?? rootPinnedOf(row.thread.id));
      return (
        <Fragment key={row.thread.id}>
          <ThreadRow
            row={row}
            section={section}
            shelf={shelf}
            inShelf={inShelf}
            ctx={ctx}
            rootPinned={rootPinned}
            inFolderId={options.inFolderId ?? null}
            environmentGroupLabel={options.environmentGroupLabel ?? null}
            activeRailLevels={railLevels.get(row.thread.id)}
            activeElbow={railPath?.path.has(row.thread.id) ?? false}
          />
          {more ? (
            <li className="relative list-none">
              <button
                type="button"
                aria-label={`Show ${Math.min(CONVERSATION_PAGE_SIZE, more.remaining)} more child threads`}
                onClick={() => bumpChildPage(more.parentId)}
                className="ps-more-conversations flex min-h-8 w-full items-center rounded py-1 pl-6 pr-2 text-left text-2xs text-muted-foreground/40 transition-colors hover:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
              >
                <span className="truncate">{`Show more (${more.remaining})`}</span>
              </button>
            </li>
          ) : null}
        </Fragment>
      );
    });
  };
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
    // Extra grouping wraps the pooled ordinary section. A per-home
    // non-personal section stays a flat list, so ARCH / Today /
    // status headings never split Cores or project folders.
    if (!section.personal) {
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
  const [groupPages, setGroupPages] = useState<ReadonlyMap<string, number>>(() => new Map());
  useEffect(() => {
    setGroupPages(new Map());
    setChildPages(new Map());
  }, [ctx.view.groupBy, section.id]);
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
    const paged =
      group.label === null
        ? { shown: group.rows, hiddenConversations: 0 }
        : pageGroupRows(group.rows, parentOf, {
            activeThreadId: ctx.activeThreadId,
            limit: groupPages.get(group.key) ?? DEFAULT_INACTIVE_CONVERSATIONS,
          });
    return (
      <div key={group.key} className={group.label ? "mt-2 first:mt-0" : undefined}>
        {group.label !== null && collapseKey !== null ? (
          <div
            data-folder-target={isDate ? UNFILED_GROUP_KEY : undefined}
            data-pin-target={isDate ? "unpin" : undefined}
            data-thread-group={group.key}
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
              tools={index === 0 ? firstGroupTools : undefined}
            />
          </div>
        ) : null}
        {open ? (
          <AnimatedList className="flex flex-col">
            {renderThreadRows(paged.shown, {
              environmentGroupLabel:
                ctx.view.groupBy === "environment" ? group.label : null,
            })}
            {paged.hiddenConversations > 0 ? (
              <button
                type="button"
                aria-label={`Show ${Math.min(CONVERSATION_PAGE_SIZE, paged.hiddenConversations)} more conversations`}
                onClick={() => {
                  setGroupPages((current) => {
                    const next = new Map(current);
                    next.set(
                      group.key,
                      (next.get(group.key) ?? DEFAULT_INACTIVE_CONVERSATIONS) +
                        CONVERSATION_PAGE_SIZE,
                    );
                    return next;
                  });
                }}
                className="ps-more-conversations flex min-h-8 w-full items-center rounded py-1 pl-6 pr-2 text-left text-2xs text-muted-foreground/40 transition-colors hover:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
              >
                <span className="truncate">{`Show more (${paged.hiddenConversations})`}</span>
              </button>
            ) : null}
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
              {renderThreadRows(partition.pinned, { rootPinned: true })}
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
                {renderThreadRows(rows, { inFolderId: folder.id })}
              </AnimatedList>
            ) : null}
          </div>
        );
      })}
        </>
      ) : null}
      {grouping && firstGroupTools !== undefined && !(groups.length > 0 && groups[0]!.label !== null) ? (
        <div data-empty-fallback="true" className="mt-2 first:mt-0">
          <div className="group/section flex min-h-7 items-center gap-1 py-1 pl-3 pr-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground/55">
              {section.name}
            </span>
            {firstGroupTools}
          </div>
          {rows.length === 0 ? (
            <p className="px-3 py-1 text-xs text-muted-foreground/70">
              {viewHasActiveFilters(ctx.view) ? "No threads match the current filters." : "No threads"}
            </p>
          ) : null}
        </div>
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
        { label: "Delete folder", run: onDelete, destructive: true, separatorBefore: true },
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
            className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded py-1 text-xs font-medium text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
          >
            <Icon name={open ? "FolderOpen" : "Folder"} className="size-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">{name}</span>
            <Icon
              name="ChevronRight"
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground/55 opacity-0 transition-transform duration-150 ease-out motion-reduce:transition-none group-hover/section:opacity-100 group-focus-within/section:opacity-100 max-md:pointer-coarse:opacity-100",
                open && "rotate-90",
              )}
            />
          </button>
        </div>
      </div>
    </SidebarActions>
  );
}

function labelsMatch(value: string | null, groupLabel: string | null): boolean {
  if (value === null || groupLabel === null) return false;
  return value.trim().toLowerCase() === groupLabel.trim().toLowerCase();
}

function ThreadRow({
  row,
  section,
  shelf,
  inShelf,
  ctx,
  rootPinned,
  inFolderId,
  environmentGroupLabel = null,
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
  /** Environment heading this row sits under, when Grouping is Environment. */
  environmentGroupLabel?: string | null;
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
  // Under an Environment heading the group already names the host/workspace,
  // so the row keeps branch (and any non-matching host) instead of repeating ARCH.
  const hideGroupedWorkspace = labelsMatch(workspace, environmentGroupLabel);
  const hideGroupedHost = labelsMatch(hostName, environmentGroupLabel);
  const secondary = [
    ctx.view.show.environment && !hideGroupedWorkspace ? workspace : null,
    ctx.view.show.branch ? branch : null,
    ctx.view.show.host && !hideGroupedHost ? location : null,
  ].filter(Boolean).join(" · ");
  const secondaryTitle = [
    ctx.view.show.environment && workspace !== null && !hideGroupedWorkspace ? workspacePath : null,
    ctx.view.show.branch ? branch : null,
    ctx.view.show.host && !hideGroupedHost ? location : null,
  ].filter(Boolean).join(" · ");
  // The resting slot speaks for the whole subtree, so a collapsed parent still
  // shows a running or attention-seeking descendant instead of hiding it.
  const statusThread = statusSourceForGroup(
    thread,
    ctx.descendantsById.get(thread.id) ?? [],
  );
  const isDropTarget = ctx.dropTarget?.id === thread.id;
  const pinnedCapable = ctx.canPin(thread.id);
  const rowPinned = rootPinned;
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
  const detachedParent =
    depth === 0 &&
    nativeParent !== undefined &&
    !inShelf.has(nativeParent.id)
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
  const indent = depth * STEP;
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
          className="flex max-w-full items-center gap-1 truncate py-1 pl-6 pr-2 text-xs leading-none text-muted-foreground/80 hover:text-foreground max-md:pointer-coarse:min-h-9"
        >
          <Icon name="CornerDownRight" className="size-3 shrink-0" />
          <span className="truncate">{threadDisplayTitle(detachedParent)}</span>
        </button>
      ) : null}

      <RowContextMenu
        thread={thread}
        onToggleChildren={hasChildren ? () => ctx.onToggleChildren(thread.id) : undefined}
        expanded={expanded}
        onTogglePin={pinnedCapable ? () => ctx.onTogglePin(thread.id, !rowPinned) : undefined}
        isPinned={rowPinned}
        onRemoveFromFolder={inFolderId !== null ? () => ctx.onRemoveFromFolder(thread.id) : undefined}
        onRename={() => setIsRenaming(true)}
        onOpen={() => ctx.onNavigate()}
        swipeDisabled={isRenaming}
      >
        <div
          data-thread-row=""
          data-thread-row-id={thread.id}
          data-thread-shelf={shelf}
          data-reorder-id={thread.id}
          data-reorder-kind="thread"
          data-reorder-scope={scope}
          className={cn(
            "group/row relative flex items-center gap-1.5 rounded-md py-1 pl-3 pr-1 transition-colors",
            secondary && "ps-workspace-row",
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
            aria-description={hasChildren ? "Hold to expand or collapse children. Swipe left to archive, swipe right to pin, or use the Actions control or Shift+F10." : "Swipe left to archive, swipe right to pin. Hold for more actions, or use the Actions control or Shift+F10."}
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
              style={{ left: ROW_PAD + indent }}
              className="ps-child-toggle absolute top-1/2 z-10 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:opacity-100"
            >
              <Icon
                name="ChevronRight"
                className={cn(
                  "size-3 transition-transform duration-150 ease-out motion-reduce:transition-none",
                  expanded && "rotate-90",
                )}
              />
            </button>
          ) : null}

          <span className={cn(
            "ps-status-slot pointer-events-none relative flex w-4 shrink-0 items-center justify-center",
            // Desktop hover yields the slot to the overlay chevron; on touch
            // widths the chevron is hidden by app.css, so the status stays.
            hasChildren && "group-hover/row:opacity-0 group-focus-within/row:opacity-0",
          )}>
            <ThreadLeadStatus
              thread={statusThread}
              exactStatus={exactStatus}
              label={rowStatus.label}
            />
          </span>

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
              "ps-thread-title w-full min-w-0 overflow-hidden whitespace-nowrap text-sm",
              thread.isUnread && "font-medium",
            )}
          />
          {secondary ? <span className="ps-thread-info mt-px block w-full overflow-hidden whitespace-nowrap text-2xs leading-none text-muted-foreground/55" title={secondaryTitle} aria-label={secondaryTitle}><span className="ps-secondary-desktop">{secondary}</span><span className="ps-secondary-mobile hidden">{[ctx.view.show.environment && !hideGroupedWorkspace ? workspace : null, ctx.view.show.branch ? branch : null].filter(Boolean).join(" · ")}</span></span> : null}
          {location && ctx.view.show.host ? <span className="ps-thread-location hidden text-xs text-muted-foreground">{location}</span> : null}
          <span className="ps-mobile-status hidden text-xs text-muted-foreground"><StatusOrTime thread={statusThread} now={ctx.now} showTime={ctx.view.show.updated} /></span>
          </div>

          <div className="relative ml-auto flex min-w-6 shrink-0 items-center justify-end gap-1 pl-1">
            <span
              data-thread-actions=""
              className="absolute inset-y-0 right-full z-20 flex items-center gap-0.5 pr-0.5 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-within:opacity-100"
            >
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
            {hasChildren ? (
              <span
                className="ps-parent-mark pointer-events-none flex size-4 shrink-0 items-center justify-center text-muted-foreground/55"
                title={`${children.length} child ${children.length === 1 ? "thread" : "threads"}`}
                aria-hidden="true"
              >
                <Icon name="User" className="size-3.5" />
              </span>
            ) : null}
            <span className="ps-thread-time pointer-events-none tabular-nums text-xs text-muted-foreground/80">
              {ctx.view.show.updated ? <ThreadAge thread={statusThread} now={ctx.now} /> : null}
            </span>
          </div>
        </div>
      </RowContextMenu>

    </li>
  );
}
