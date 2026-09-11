import {
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
} from "react";
import { toast } from "sonner";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { flattenShelf, scopeOf, type ProjectSectionData } from "./forest";
import { ageGroupKey, groupPersonalRows, personalAgeGroups } from "./age-groups";
import { SectionDivider } from "./SectionDivider";
import { AnimatedList } from "./AnimatedList";
import type { ThreadShelf } from "./lifecycle";
import type { DropPlacement } from "./thread-order";
import type { LifecycleAction, LifecycleApi } from "./useLifecycle";
import { InlineThreadTitle } from "./InlineThreadTitle";
import { PullRequestMark } from "./PullRequestMark";
import { RowContextMenu } from "./RowContextMenu";
import { StatusOrTime } from "./StatusSlot";
import { statusSourceForGroup, threadDisplayTitle } from "./inbox";

/** Everything a row needs that is the same for every row in a section. */
export interface TreeContext {
  visibleById: ReadonlyMap<string, PluginSidebarThread>;
  descendantsById: ReadonlyMap<string, readonly PluginSidebarThread[]>;
  activeThreadId: string | null;
  expandedParents: ReadonlySet<string>;
  expandedAgeGroups: ReadonlySet<string>;
  onToggleAgeGroup: (key: string) => void;
  lifecycle: LifecycleApi;
  lifecycleStatus: "loading" | "ready" | "error";
  isPending: (threadId: string, action: LifecycleAction) => boolean;
  now: number;
  onNavigate: () => void;
  onToggleChildren: (threadId: string) => void;
  focusThread: (threadId: string, fallbackKey: string | null) => void;
  openSettledDrawer: () => void;
  onThreadDragStart: (
    event: ReactPointerEvent<HTMLElement>,
    section: ProjectSectionData,
    thread: PluginSidebarThread,
    shelf: ThreadShelf,
    pinKey: string,
  ) => void;
  consumeSuppressedClick: (threadId: string) => boolean;
  /** The row the pointer is over during a drag, for the placement line. */
  dropTarget: { id: string; placement: DropPlacement } | null;
  draggingThreadId: string | null;
}

// Connector geometry, in px from the row's left edge. Ported from Dray's
// sidebar so the rails read the same way.
const RAIL_X = 12;
const STEP = 12;
const ELBOW = 10;

const ACTION_BUTTON_CLASS =
  "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-40 max-md:pointer-coarse:h-9 max-md:pointer-coarse:w-9";
const ACTION_ICON_CLASS = "size-3.5 max-md:pointer-coarse:size-5";

/** One shelf's rows, flattened with connector data. */
export function ShelfList({
  section,
  shelf,
  ctx,
}: {
  section: ProjectSectionData;
  shelf: ThreadShelf;
  ctx: TreeContext;
}) {
  const rows = useMemo(
    () => flattenShelf(section, shelf, (id) => ctx.expandedParents.has(id)),
    [ctx.expandedParents, section, shelf],
  );
  const inShelf = useMemo(
    () => new Set(section.byShelf[shelf].map((thread) => thread.id)),
    [section, shelf],
  );
  const groups = useMemo(
    () => section.personal && shelf === "active"
      ? groupPersonalRows(rows, personalAgeGroups(section, ctx.now))
      : [{ label: null, rows }],
    [ctx.now, rows, section, shelf],
  );
  return <>{groups.map((group) => {
    const key = group.label ? ageGroupKey(section.id, group.label) : null;
    const open = key === null || ctx.expandedAgeGroups.has(key);
    return (
    <div key={group.label ?? shelf} className={group.label ? "mt-2 first:mt-0" : undefined}>
      {group.label && key ? (
        <SectionDivider
          label={group.label}
          open={open}
          onToggle={() => ctx.onToggleAgeGroup(key)}
          shelfKey={key}
        />
      ) : null}
    {open ? <AnimatedList className="flex flex-col">
      {group.rows.map((row) => (
        <ThreadRow
          key={row.thread.id}
          row={row}
          section={section}
          shelf={shelf}
          inShelf={inShelf}
          ctx={ctx}
        />
      ))}
    </AnimatedList> : null}
    </div>
  );})}</>;
}

function ThreadRow({
  row,
  section,
  shelf,
  inShelf,
  ctx,
}: {
  row: ReturnType<typeof flattenShelf>[number];
  section: ProjectSectionData;
  shelf: ThreadShelf;
  inShelf: ReadonlySet<string>;
  ctx: TreeContext;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(row.thread.id);
  const [isRenaming, setIsRenaming] = useState(false);

  const { thread, depth, guides, opens } = row;
  const isActive = thread.id === ctx.activeThreadId;
  const isPinned = thread.isPinned;
  const pinKey = isPinned ? "1" : "0";
  const scope = scopeOf(section, thread.id);
  const ready = ctx.lifecycleStatus === "ready";
  const canPark = ctx.lifecycle.canPark(
    thread,
    ctx.descendantsById.get(thread.id) ?? [],
  );
  const settlePending = ctx.isPending(thread.id, "settle");
  const unsettlePending = ctx.isPending(thread.id, "unsettle");
  const title = threadDisplayTitle(thread);
  // The resting slot speaks for the whole subtree, so a collapsed parent still
  // shows a running or attention-seeking descendant instead of hiding it.
  const statusThread = statusSourceForGroup(
    thread,
    ctx.descendantsById.get(thread.id) ?? [],
  );
  const isDropTarget = ctx.dropTarget?.id === thread.id;

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
    depth === 0 && nativeParent !== undefined && !inShelf.has(nativeParent.id)
      ? nativeParent
      : null;

  const showSettle = ready && shelf === "active" && canPark;
  const showRestore = ready && shelf === "settled";

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
    splitProps.onPointerDown?.(event);
    ctx.onThreadDragStart(event, section, thread, shelf, pinKey);
  };

  const togglePin = () => {
    void actions.setPinned(thread.id, !isPinned).catch((cause: unknown) => {
      toast.error("Could not update pin", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    });
  };

  const ownRail = RAIL_X + (depth - 1) * STEP;
  const parentCarriesOn = guides[depth - 1] ?? false;
  const indent = depth === 0 ? 0 : ownRail + ELBOW - 8;

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
          className="flex max-w-full items-center gap-1 truncate py-0.5 pl-6 pr-2 text-xs leading-none text-muted-foreground/60 hover:text-foreground max-md:pointer-coarse:min-h-9"
        >
          <Icon name="CornerDownRight" className="size-3 shrink-0" />
          <span className="truncate">{threadDisplayTitle(detachedParent)}</span>
        </button>
      ) : null}

      <RowContextMenu
        thread={thread}
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
          data-reorder-pin={pinKey}
          className={cn(
            "group/row relative flex items-center rounded-md py-0.5 pl-1 pr-1 transition-colors",
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
            data-reorder-pin={pinKey}
            href="#"
            aria-label={`${title}${isActive ? ", selected" : ""}`}
            aria-current={isActive ? "true" : undefined}
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
                  className="pointer-events-none absolute top-0 -bottom-px w-px bg-sidebar-border"
                  style={{ left: RAIL_X + level * STEP }}
                />
              ),
          )}
          {depth > 0 ? (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 w-px bg-sidebar-border"
                style={{
                  left: ownRail,
                  height: parentCarriesOn ? "calc(100% + 1px)" : "50%",
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute h-px bg-sidebar-border"
                style={{ left: ownRail + 1, top: "50%", width: ELBOW - 5 }}
              />
            </>
          ) : null}
          {opens ? (
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-px w-px bg-sidebar-border"
              style={{ left: RAIL_X + depth * STEP, top: "50%" }}
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
              className="relative z-10 mr-1 flex h-4 w-3 shrink-0 items-center justify-center text-muted-foreground opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:opacity-100"
            >
              <Icon name={expanded ? "ChevronDown" : "ChevronRight"} className="size-3" />
            </button>
          ) : <span aria-hidden className="mr-1 w-3 shrink-0" />}

          <PullRequestMark threadId={thread.id} />

          <div className="flex min-w-0 flex-1 items-center gap-1.5">
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
              "min-w-0 truncate text-sm",
              thread.isUnread && "font-medium",
            )}
          />
          </div>

          {/* Time and hover actions share a stable footprint. */}
          <div className="relative flex h-6 min-w-14 shrink-0 items-center justify-end pl-1 max-md:pointer-coarse:h-9 max-md:pointer-coarse:min-w-24">
            <span className="pointer-events-none flex items-center gap-1 text-xs text-muted-foreground tabular-nums group-hover/row:invisible group-focus-within/row:invisible max-md:pointer-coarse:invisible">
              <span className="flex min-w-6 items-center justify-end">
                <StatusOrTime thread={statusThread} now={ctx.now} />
              </span>
            </span>
            <span className="absolute right-0 z-10 hidden items-center gap-0.5 group-hover/row:flex group-focus-within/row:flex max-md:pointer-coarse:flex">
              <button
                type="button"
                aria-label={isPinned ? "Unpin thread" : "Pin thread"}
                aria-pressed={isPinned}
                title={isPinned ? "Unpin" : "Pin"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  togglePin();
                }}
                className={ACTION_BUTTON_CLASS}
              >
                <Icon
                  name={isPinned ? "PinOff" : "Pin"}
                  className={cn(
                    ACTION_ICON_CLASS,
                    isPinned && "text-foreground",
                  )}
                />
              </button>
              {showSettle ? (
                <button
                  type="button"
                  aria-label="Settle thread"
                  title="Settle"
                  disabled={settlePending}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (settlePending) return;
                    ctx.openSettledDrawer();
                    void ctx.lifecycle
                      .settle(thread.id)
                      .finally(() => ctx.focusThread(thread.id, "settled"));
                  }}
                  className={ACTION_BUTTON_CLASS}
                >
                  <Icon name="Check" className={ACTION_ICON_CLASS} />
                </button>
              ) : null}
              {showRestore ? (
                <button
                  type="button"
                  aria-label="Restore thread"
                  title="Restore"
                  disabled={unsettlePending}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (unsettlePending) return;
                    void ctx.lifecycle
                      .unsettle(thread.id)
                      .finally(() => ctx.focusThread(thread.id, null));
                  }}
                  className={ACTION_BUTTON_CLASS}
                >
                  <Icon name="ArrowTurnBackward" className={ACTION_ICON_CLASS} />
                </button>
              ) : null}
            </span>
          </div>
        </div>
      </RowContextMenu>
    </li>
  );
}
