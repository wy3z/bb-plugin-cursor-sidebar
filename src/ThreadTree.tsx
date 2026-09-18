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
  groupOrdinaryRows,
  ordinaryThreadStatus,
  usableEnvironmentLabel,
  viewHasActiveFilters,
  type OrdinaryGroup,
} from "./sidebar-view";
import type { SidebarView } from "./server";
import { SectionDivider } from "./SectionDivider";
import { SidebarActions } from "./SidebarActions";
import { AnimatedList } from "./AnimatedList";
import { Drawer } from "./Drawer";
import type { ThreadShelf } from "./lifecycle";
import type { DropPlacement } from "./thread-order";
import { InlineThreadTitle } from "./InlineThreadTitle";
import { PullRequestMark } from "./PullRequestMark";
import { RowContextMenu } from "./RowContextMenu";
import {
  ThreadAge,
  ThreadLeadStatus,
} from "./StatusSlot";
import { hasStatusGlyph } from "./StatusGlyph";
import {
  CONVERSATION_PAGE_SIZE,
  DEFAULT_INACTIVE_CONVERSATIONS,
  pageGroupRows,
} from "./conversations";
import { ShowMoreButton } from "./ShowMoreButton";
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
  now: number;
  onNavigate: () => void;
  onToggleChildren: (threadId: string) => void;
  onThreadDragStart: (
    event: ReactPointerEvent<HTMLElement>,
    section: ProjectSectionData,
    thread: PluginSidebarThread,
    shelf: ThreadShelf,
  ) => void;
  /** Touch long-press pick-up: engage a reorder drag for a pointer already down. */
  onThreadDragPickUp: (
    pointerId: number,
    clientX: number,
    clientY: number,
    section: ProjectSectionData,
    thread: PluginSidebarThread,
    shelf: ThreadShelf,
  ) => void;
  /** True when an automatic conversation order is off, so dragging may reorder. */
  canDragThreads: boolean;
  /** Touch long-press pick-up for a project heading reorder. */
  onProjectDragPickUp: (
    pointerId: number,
    clientX: number,
    clientY: number,
    sectionId: string,
  ) => void;
  consumeSuppressedClick: (threadId: string) => boolean;
  /** Digit that opens each thread while BB's keybind guide is up, by thread id. */
  shortcutKeys: ReadonlyMap<string, string> | null;
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
  /** The thread under the pointer's center band: a nest drop is pending. */
  childDropTarget: string | null;
}

// Tree coordinates are px from the row's left border. Headings and thread
// rows share `pl-2` (8px) then a 16px status slot; rails run through that
// slot's centre so a parent disc, its hover chevron, and the line to its
// children occupy one column. Each nested level steps by one slot.
const ROW_PAD = 8;
const SLOT = 16;
const STEP = 16;
/** The row's flex gap (Tailwind `gap-1.5`); it offsets the first indent. */
const ROW_GAP = 6;
/** Centre of the depth-0 status slot. */
const TREE_RAIL_X = ROW_PAD + SLOT / 2;
/** Depth-1 spacer before the status slot; also the project-child indent. */

/**
 * x of the rail dropping from a row at `level` to its children. It must sit on
 * that row's disc column: the layout adds the flex gap once on top of the
 * indent, so a plain `level * STEP` drifts a gap left from the second level on.
 */
export function treeRailX(level: number): number {
  return TREE_RAIL_X + level * STEP;
}

/**
 * Centre of a row's status disc, measured from the row's left edge. The spacer
 * is shrunk by the flex gap, so every level steps exactly `STEP` right of its
 * parent's disc and the elbow ends on the centre at any depth.
 */
export function treeDotX(depth: number): number {
  return ROW_PAD + depth * STEP + SLOT / 2;
}

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

/**
 * The selected thread's ancestor path in one rendered list: the rails that lead
 * from the top down to the selected row are the only ones that light, never
 * every rail in the subtree. Pure so the pinned list, which renders its own
 * rows, can light the same path as a shelf list does.
 */
function railPathFor(
  section: ProjectSectionData,
  rows: readonly DisplayRow[],
  activeThreadId: string | null,
  shelf: ThreadShelf,
): { levels: ReadonlyMap<string, ReadonlySet<number>>; onPath: ReadonlySet<string> } {
  const levels = new Map<string, ReadonlySet<number>>();
  const onPath = new Set<string>();
  if (shelf !== "active" || activeThreadId === null) return { levels, onPath };
  const chain = activePathIds(section, activeThreadId);
  if (chain.length === 0 || chain[chain.length - 1] !== activeThreadId) return { levels, onPath };
  const index = new Map(rows.map((row, position) => [row.thread.id, position]));
  const activeIndex = index.get(activeThreadId);
  if (activeIndex === undefined) return { levels, onPath };
  // Row depth counts the Project Manager as depth 0 even though its heading
  // stands in for that row, so a direct conversation sits at depth 1.
  const depth = rows[activeIndex]!.depth;
  const ancestorIndex: number[] = [];
  let cursor: string | null = activeThreadId;
  let level = depth - 1;
  while (cursor !== null && level >= 0) {
    cursor = section.forest.parent.get(cursor) ?? null;
    ancestorIndex[level] = cursor === null ? -1 : index.get(cursor) ?? -1;
    level -= 1;
  }
  for (let fill = level; fill >= 0; fill -= 1) ancestorIndex[fill] = -1;
  for (const id of chain) onPath.add(id);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const bright = new Set<number>();
    const own = row.depth - 1;
    // An ancestor level is bright only along the segment that actually reaches
    // the next node on the path. Past that node's row the line is the quiet
    // run to the remaining siblings, so the active row never lights it.
    for (let level = 0; level < own; level += 1) {
      const segmentEnd = ancestorIndex[level + 1];
      if (
        level < depth &&
        ancestorIndex[level]! < i &&
        segmentEnd !== undefined &&
        i <= segmentEnd
      ) {
        bright.add(level);
      }
    }
    if (own >= 0 && own < depth && ancestorIndex[own]! < i && i <= activeIndex) {
      bright.add(own);
    }
    if (onPath.has(row.thread.id) && row.depth < depth) bright.add(row.depth);
    levels.set(row.thread.id, bright);
  }
  return { levels, onPath };
}

export function PinnedList({ items, ctx }: { items: readonly LiftedPin[]; ctx: TreeContext }) {
  // The block lifts families from several homes, so the path is resolved per
  // home against that home's own pinned rows; otherwise a pinned selection
  // would never light the rails that lead to it.
  const rails = useMemo(() => {
    const groups = new Map<string, { section: ProjectSectionData; rows: DisplayRow[] }>();
    for (const { section, row } of items) {
      const group = groups.get(section.id);
      if (group === undefined) groups.set(section.id, { section, rows: [row] });
      else group.rows.push(row);
    }
    const info = new Map<string, { levels: ReadonlySet<number> | undefined; onPath: boolean }>();
    for (const { section, rows } of groups.values()) {
      const { levels, onPath } = railPathFor(section, rows, ctx.activeThreadId, "active");
      for (const row of rows) {
        info.set(row.thread.id, { levels: levels.get(row.thread.id), onPath: onPath.has(row.thread.id) });
      }
    }
    return info;
  }, [ctx.activeThreadId, items]);
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
          activeRailLevels={rails.get(row.thread.id)?.levels}
          activeElbow={rails.get(row.thread.id)?.onPath ?? false}
        />
      ))}
    </AnimatedList>
  );
}


/** One shelf's rows, flattened with connector data. */
export function ShelfList({
  section,
  shelf,
  ctx,
  keepIds,
  expandIds,
  grouped,
  firstGroupTools,
}: {
  section: ProjectSectionData;
  shelf: ThreadShelf;
  ctx: TreeContext;
  /** Presentation subset for a bounded project preview; omitted means all. */
  keepIds?: ReadonlySet<string>;
  /** Threads force-opened for this render only (a revealed collapsed path). */
  expandIds?: ReadonlySet<string>;
  /**
   * Pinned/folder/date grouping applies to an ordinary home (a native Project
   * or Chats).
   */
  grouped: boolean;
  /** Tools on the first bucket heading, or a static fallback heading when no bucket renders. */
  firstGroupTools?: ReactNode;
}) {
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
  const { levels: railLevels, onPath } = useMemo(
    () => railPathFor(section, rows, ctx.activeThreadId, shelf),
    [ctx.activeThreadId, rows, section, shelf],
  );
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
  const knownFolderIds = useMemo(
    () => new Set(ctx.threadSections.map((folder) => folder.id)),
    [ctx.threadSections],
  );
  const parentOf = useCallback(
    (threadId: string): string | null => section.forest.parent.get(threadId) ?? null,
    [section],
  );
  // A pin on any family member lifts the whole family into the global Pinned
  // block, so a child's native pin reads as the family's. The set comes from
  // the home's complete shelf, not the bounded render, so a pin on a child
  // past the preview page lifts the family here exactly as the block does.
  const pinnedFamilyRoots = useMemo(() => {
    const pinned = new Set<string>();
    if (!grouping) return pinned;
    for (const thread of section.byShelf[shelf]) {
      if (thread.isPinned) pinned.add(familyRootId(parentOf, thread.id));
    }
    return pinned;
  }, [grouping, parentOf, section, shelf]);
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
            activeElbow={onPath.has(row.thread.id)}
          />
          {more ? (
            <li className="relative list-none">
              <ShowMoreButton
                hiddenConversations={more.remaining}
                onShowMore={() => bumpChildPage(more.parentId)}
                ariaLabel={`Show ${Math.min(CONVERSATION_PAGE_SIZE, more.remaining)} more child threads`}
              />
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
      members: section.members,
    });
  }, [partition, rows, grouping, ctx.now, ctx.view, parentOf, shelf, section.members, section.personal]);
  const [groupPages, setGroupPages] = useState<ReadonlyMap<string, number>>(() => new Map());
  useEffect(() => {
    setGroupPages(new Map());
    setChildPages(new Map());
  }, [ctx.view.groupBy, section.id]);
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
              onNewThread={
                group.label === "Today" && firstGroupTools === undefined
                  ? ctx.onNewThread
                  : undefined
              }
              shelfKey={collapseKey}
              tools={index === 0 ? firstGroupTools : undefined}
            />
          </div>
        ) : null}
        <Drawer open={open}>
          <AnimatedList className="flex flex-col">
            {renderThreadRows(paged.shown, {
              environmentGroupLabel:
                ctx.view.groupBy === "environment" ? group.label : null,
            })}
            {paged.hiddenConversations > 0 ? (
              <ShowMoreButton
                hiddenConversations={paged.hiddenConversations}
                onShowMore={() => {
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
              />
            ) : null}
          </AnimatedList>
        </Drawer>
      </div>
    );
  };

  return (
    /* One animated parent for the section's blocks: a filter change can remove
       a whole bucket, and only the group list itself can animate that out and
       slide the survivors up. Rows inside a surviving bucket animate in their
       own list. */
    <AnimatedList as="div" className="flex flex-col">
      {grouping && partition !== null ? (
        <>
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
            <Drawer open={open && rows.length > 0}>
              <AnimatedList className="flex flex-col">
                {renderThreadRows(rows, { inFolderId: folder.id })}
              </AnimatedList>
            </Drawer>
          </div>
        );
      })}
        </>
      ) : null}
      {grouping && firstGroupTools !== undefined && !(groups.length > 0 && groups[0]!.label !== null) ? (
        <div data-empty-fallback="true" className="mt-2 first:mt-0">
          <div className="group/section flex min-h-7 items-center gap-1 py-1 pl-3 pr-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/73">
              {section.name}
            </span>
            {firstGroupTools}
          </div>
          {rows.length === 0 ? (
            <p className="px-3 py-1 text-xs text-sidebar-foreground/73">
              {viewHasActiveFilters(ctx.view) ? "No threads match the current filters." : "No threads"}
            </p>
          ) : null}
        </div>
      ) : null}
      {groups.map(renderGroup)}
    </AnimatedList>
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
            className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded py-1 text-xs font-medium text-sidebar-foreground/73 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9"
          >
            <Icon name={open ? "FolderOpen" : "Folder"} className="size-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">{name}</span>
            <Icon
              name="ChevronRight"
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-sidebar-foreground/73 opacity-0 transition-transform duration-150 ease-out motion-reduce:transition-none group-hover/section:opacity-100 group-focus-within/section:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100",
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

  const { thread, depth, guides } = row;
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
  const nameLabel = native.environment?.name?.trim() || null;
  const pathLabel = workspacePath
    ? workspacePath.split(/[\\/]/).filter(Boolean).at(-1)?.trim() ?? null
    : null;
  const workspace = usableEnvironmentLabel(nameLabel) ?? usableEnvironmentLabel(pathLabel);
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

  const ownRail = treeRailX(depth - 1);
  /** The guide digit for this row, or null when the guide is down. */
  const shortcutKey = ctx.shortcutKeys?.get(thread.id) ?? null;
  const parentCarriesOn = guides[depth - 1] ?? false;
  // The flex gap before the disc is part of the step, so the spacer carries
  // the step minus that gap and every level lands `STEP` right of its parent.
  const indent = Math.max(0, depth * STEP - ROW_GAP);
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
          className="flex max-w-full items-center gap-1 truncate py-1 pl-6 pr-2 text-xs leading-none text-sidebar-foreground/73 hover:text-sidebar-foreground/90 max-md:min-h-9 pointer-coarse:min-h-9"
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
        onReorderStart={
          ctx.canDragThreads
            ? (pointerId, clientX, clientY) => {
                ctx.onThreadDragPickUp(pointerId, clientX, clientY, section, thread, shelf);
                return true;
              }
            : undefined
        }
      >
        <div
          data-thread-row=""
          data-thread-row-id={thread.id}
          data-thread-shelf={shelf}
          data-reorder-id={thread.id}
          data-reorder-kind="thread"
          data-reorder-scope={scope}
          className={cn(
            "group/row relative flex items-center gap-1.5 rounded-md py-1 pl-2 pr-2",
            secondary && "cs-workspace-row",
            "min-h-7 max-md:min-h-11 pointer-coarse:min-h-11",
            // The row is the drag surface, but it reads as a link: the title
            // inherits the hand so it never swaps in a caret.
            "cursor-pointer",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/95 hover:bg-sidebar-accent/60",
            !isActive && layout !== null && "bg-sidebar-accent/30",
            ctx.childDropTarget === thread.id && "bg-primary/10 ring-1 ring-primary/60",
            shelf === "settled" &&
              !isActive &&
              "text-sidebar-foreground/73 hover:bg-sidebar-accent/25 hover:text-sidebar-foreground/73",
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
            aria-description="Swipe left to pin, swipe right to archive. Hold to open the actions menu, or use the Actions control or Shift+F10."
            {...splitProps}
            draggable={false}
            onPointerDown={handlePointerDown}
            onClick={(event) => {
              event.preventDefault();
              if (ctx.consumeSuppressedClick(thread.id)) return;
              open(event);
            }}
            className="absolute inset-0 cursor-pointer rounded-md outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
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
                  style={{ left: treeRailX(level) - 0.5 }}
                />
              ),
          )}
          {depth > 0 ? (
            <>
              {activeElbow === true && parentCarriesOn ? (
                <>
                  {/* Any row on the active path ends the highlighted run at its
                      own dot; the branch to the remaining siblings stays quiet. */}
                  <span
                    aria-hidden
                    className={cn("pointer-events-none absolute top-0 w-px", railClass(depth - 1))}
                    style={{ left: ownRail - 0.5, height: "50%" }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute w-px bg-sidebar-border"
                    style={{ left: ownRail - 0.5, top: "50%", bottom: "-1px" }}
                  />
                </>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-0 w-px",
                    railClass(depth - 1),
                  )}
                  style={{
                    left: ownRail - 0.5,
                    height: parentCarriesOn ? "calc(100% + 1px)" : "50%",
                  }}
                />
              )}
              <span
                aria-hidden
                className={cn("pointer-events-none absolute h-px", elbowClass)}
                style={{
                  left: ownRail + 0.5,
                  top: "calc(50% - 0.5px)",
                  width: Math.max(0, treeDotX(depth) - ownRail - 0.5),
                }}
              />
            </>
          ) : null}
          {/* The last piece of a parent's rail: without it the line starts at
              the first child and leaves a visible gap under the parent's dot. */}
          {hasChildren && expanded ? (
            <span
              aria-hidden
              className={cn("pointer-events-none absolute w-px", railClass(depth))}
              style={{ left: treeRailX(depth) - 0.5, top: "50%", bottom: "-1px" }}
            />
          ) : null}
          {indent > 0 ? <span aria-hidden style={{ width: indent }} className="shrink-0" /> : null}

          <span className="cs-status-slot pointer-events-none relative flex w-4 shrink-0 items-center justify-center">
            {/* Only the status glyph yields to the overlay chevron. The slot
                itself stays put, so the chevron centres on the dot at any
                depth instead of drifting left with the indent gap. */}
            <span
              className={cn(
                "pointer-events-none flex",
                // A rail runs behind this glyph whenever one connects to it, so
                // the glyph gets a disc of the list surface. Without it a
                // spinner's gaps show the line crossing the icon.
                (depth > 0 || (hasChildren && expanded)) && "cs-status-glyph relative",
                hasChildren && "group-hover/row:opacity-0 group-focus-within/row:opacity-0",
              )}
            >
              <ThreadLeadStatus
                thread={statusThread}
                exactStatus={exactStatus}
                label={rowStatus.label}
              />
            </span>
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
                className="cs-child-toggle pointer-events-auto absolute inset-0 z-10 flex items-center justify-center text-sidebar-foreground/73 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:opacity-100 pointer-coarse:opacity-100"
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
          </span>

          {ctx.view.show.pr ? <PullRequestMark threadId={thread.id} /> : null}

          <div className={cn("pointer-events-none flex min-w-0 flex-1 flex-col items-start", secondary ? "gap-0 leading-none" : "gap-0")}>
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
              "cs-thread-title w-full min-w-0 overflow-hidden whitespace-nowrap text-sm",
              thread.isUnread && "font-medium",
            )}
          />
          {secondary ? <span className="cs-thread-info mt-px block w-full overflow-hidden whitespace-nowrap text-2xs leading-none text-sidebar-foreground/73" title={secondaryTitle} aria-label={secondaryTitle}><span className="cs-secondary-desktop">{secondary}</span><span className="cs-secondary-mobile hidden">{[ctx.view.show.environment && !hideGroupedWorkspace ? workspace : null, ctx.view.show.branch ? branch : null].filter(Boolean).join(" · ")}</span></span> : null}
          </div>

          <div className="relative ml-auto flex min-w-6 shrink-0 items-center justify-end gap-1 pl-1">
            {shortcutKey !== null ? (
              /* While the guide is up the digit takes the row's right edge, so
                 the age and the hover actions clear out of its way. */
              <kbd className="cs-shortcut-key" aria-hidden="true">{shortcutKey}</kbd>
            ) : (
              <>
            {/* The actions anchor to the parent-mark group's right edge, which
                is always the age's left edge, so they cover the parent mark and
                the title's reserved padding but never the time. */}
            <span className="relative flex items-center self-stretch">
              <span
                data-thread-actions=""
                className="cs-row-actions pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center gap-0.5 pr-0.5 opacity-0 transition-opacity duration-100 ease-out motion-reduce:transition-none group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 focus-within:opacity-100"
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
                    className="cs-row-action pointer-events-none flex size-5 items-center justify-center rounded text-sidebar-foreground/73 group-hover/row:pointer-events-auto group-focus-within/row:pointer-events-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
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
                  className="cs-row-action pointer-events-none flex size-5 items-center justify-center rounded text-sidebar-foreground/73 group-hover/row:pointer-events-auto group-focus-within/row:pointer-events-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                >
                  <Icon name="Archive" className="size-3.5" />
                </button>
              </span>
              {hasChildren ? (
                <span
                  className="pointer-events-none flex size-4 shrink-0 items-center justify-center text-sidebar-foreground/73 transition-opacity duration-100 ease-out motion-reduce:transition-none group-hover/row:opacity-0 group-focus-within/row:opacity-0"
                  title={`${children.length} child ${children.length === 1 ? "thread" : "threads"}`}
                  aria-hidden="true"
                >
                  <Icon name="User" className="size-3.5" />
                </span>
              ) : null}
            </span>
            <span className="cs-thread-time pointer-events-none tabular-nums text-xs text-sidebar-foreground/73">
              {ctx.view.show.updated ? <ThreadAge thread={statusThread} now={ctx.now} /> : null}
            </span>
              </>
            )}
          </div>
        </div>
      </RowContextMenu>

    </li>
  );
}
