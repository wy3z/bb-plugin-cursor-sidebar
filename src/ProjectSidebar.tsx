import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toast } from "sonner";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  useRpc,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { ProjectChecklist } from "./ProjectChecklist";
import { SectionDivider } from "./SectionDivider";
import { cn } from "@/lib/utils";
import { isProtectedInteractionTarget, matchesSettleShortcut } from "./settle-shortcut";
import {
  buildSections,
  flattenShelf,
  scopeOf,
  type ProjectSectionData,
} from "./forest";
import type { projectSidebarRpcContract } from "./server";
import { ShelfList, type TreeContext } from "./ThreadTree";
import { descendantsOf, resolveThreadDisplayTitles, threadDisplayTitle, visibleInboxThreads } from "./inbox";
import { useLifecycle } from "./useLifecycle";
import { useThreadOrders } from "./useThreadOrders";
import { useReorderDrag, type ReorderDragState } from "./useReorderDrag";
import {
  mergeVisibleOrder,
  moveIdByOffset,
  orderByStoredIds,
  reconcileOrder,
  type DropPlacement,
} from "./thread-order";
import {
  isProjectOpen,
  HIDDEN_PROJECTS_KEY,
  EXPANDED_AGES_KEY,
  usePersistentIds,
  usePersistentSettledOpen,
} from "./collapse";
import type { ThreadShelf } from "./lifecycle";
import { ageGroupKey, personalAgeGroups } from "./age-groups";
import { AnimatedList } from "./AnimatedList";

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * Project-grouped thread list. BB's projects are the only containers, the
 * native personal container is shown as Threads, and settled threads sit in
 * one collapsed section under the thread list rather than a shelf per project.
 */
export function ProjectSidebar({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const { status, threads: rawThreads, projects } = useSidebarThreads();
  const threads = useMemo(
    () => resolveThreadDisplayTitles(rawThreads),
    [rawThreads],
  );
  const {
    status: lifecycleStatus,
    error: lifecycleError,
    api: lifecycle,
    isPending,
    retry,
    dismissError,
  } = useLifecycle();
  const threadOrders = useThreadOrders();
  const threadOrdersRef = useRef(threadOrders);
  threadOrdersRef.current = threadOrders;
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const actions = useSidebarThreadActions();

  const [scrolling, setScrolling] = useState(false);
  const scrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScroll = useCallback(() => {
    setScrolling(true);
    if (scrollIdleTimer.current !== null) clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = setTimeout(() => {
      setScrolling(false);
      scrollIdleTimer.current = null;
    }, 900);
  }, []);
  useEffect(() => () => {
    if (scrollIdleTimer.current !== null) clearTimeout(scrollIdleTimer.current);
  }, []);

  const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const timer = setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const now = nowMinute * 60_000;

  const collapsedProjects = usePersistentIds();
  const expandedAges = usePersistentIds(EXPANDED_AGES_KEY);
  const settledDrawer = usePersistentSettledOpen();
  const hiddenProjects = usePersistentIds(HIDDEN_PROJECTS_KEY);
  const [projectOverride, setProjectOverride] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [expandedParents, setExpandedParents] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleChildren = useCallback((threadId: string) => {
    setExpandedParents((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }, []);

  const personalProjectIds = useMemo(
    () => new Set(projects.filter((project) => project.isPersonal).map((project) => project.id)),
    [projects],
  );

  const visible = useMemo(() => visibleInboxThreads(threads), [threads]);
  const visibleById = useMemo(
    () => new Map(visible.map((thread) => [thread.id, thread])),
    [visible],
  );
  // Descendants follow native parent links across projects: parking
  // eligibility considers the whole real subtree.
  const descendantsById = useMemo(() => {
    const map = new Map<string, readonly PluginSidebarThread[]>();
    for (const thread of visible) {
      map.set(thread.id, descendantsOf(visible, thread.id));
    }
    return map;
  }, [visible]);

  // Commit a released drag into the persistent stores.
  const sectionsRef = useRef<ProjectSectionData[]>([]);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const projectOverrideRef = useRef(projectOverride);
  projectOverrideRef.current = projectOverride;
  const projectMutationRef = useRef<Promise<void>>(Promise.resolve());
  const projectAttemptRef = useRef(0);
  const onDragCommit = useCallback(
    (committed: ReorderDragState) => {
      if (committed.kind === "project") {
        // `committed.ids` is the reorderable (non-personal) order only.
        const nextReorderable = mergeVisibleOrder(
          orderByStoredIds(projectsRef.current, projectOverrideRef.current)
            .filter((project) => !project.isPersonal).map((project) => project.id),
          committed.ids,
        );
        const index = nextReorderable.indexOf(committed.movingId);
        const previousProjectId = index > 0 ? nextReorderable[index - 1]! : null;
        const nextProjectId =
          index >= 0 && index < nextReorderable.length - 1
            ? nextReorderable[index + 1]!
            : null;
        const baseFull = orderByStoredIds(
          projectsRef.current,
          projectOverrideRef.current,
        ).map((project) => project.id);
        setProjectOverride(mergeVisibleOrder(baseFull, nextReorderable));
        const attempt = ++projectAttemptRef.current;
        // Serialize overlapping reorders so a slower earlier request cannot
        // land after a later one and leave a stale native order.
        projectMutationRef.current = projectMutationRef.current
          .catch(() => undefined)
          .then(async () => {
            try {
              await rpc.call("reorderProjects", {
                projectId: committed.movingId,
                previousProjectId,
                nextProjectId,
              });
            } catch (cause) {
              // Only the latest attempt clears the overlay; an older failed
              // request must not discard a newer optimistic order.
              if (projectAttemptRef.current === attempt) setProjectOverride(null);
              toast.error("Could not reorder projects", {
                description: cause instanceof Error ? cause.message : String(cause),
              });
            }
          });
        return;
      }
      const section = sectionsRef.current.find(
        (candidate) => candidate.id === committed.sectionId,
      );
      if (section === undefined) return;
      // Reconcile the stored order against the complete current scope before
      // merging: new siblings and hidden settled siblings keep a slot instead
      // of being dropped from the saved order.
      const base = section.scopeIds.get(committed.scope) ?? committed.ids;
      const stored = threadOrdersRef.current.orderForScope(committed.scope);
      const global = reconcileOrder(stored, base);
      void threadOrdersRef.current.reorder(
        committed.scope,
        mergeVisibleOrder(global, committed.ids),
      );
    },
    [rpc],
  );
  const drag = useReorderDrag(onDragCommit);

  // Live project order: the drag list while dragging, the optimistic overlay
  // until the host list catches up, otherwise the native list. The implicit
  // personal container is never part of a native reorder and stays put.
  const baseOrderedProjects = useMemo(
    () => orderByStoredIds(projects, projectOverride),
    [projectOverride, projects],
  );
  const baseProjectIds = useMemo(
    () => baseOrderedProjects.map((project) => project.id),
    [baseOrderedProjects],
  );
  const reorderableProjectIds = useMemo(
    () => baseOrderedProjects.filter((project) => !project.isPersonal && !hiddenProjects.ids.has(project.id)).map((project) => project.id),
    [baseOrderedProjects, hiddenProjects.ids],
  );
  const liveProjectIds =
    drag.state?.kind === "project"
      ? mergeVisibleOrder(baseProjectIds, drag.state.ids)
      : baseProjectIds;
  const orderedProjects = useMemo(
    () => orderByStoredIds(projects, liveProjectIds),
    [liveProjectIds, projects],
  );
  const displayProjects = useMemo(
    () =>
      orderedProjects.map((project) => ({
        id: project.id,
        name: project.isPersonal ? "Threads" : project.name,
        isPersonal: project.isPersonal,
      })),
    [orderedProjects],
  );

  const effectiveOrderForScope = useCallback(
    (scope: string) => {
      const dragging = drag.state;
      if (dragging !== null && dragging.kind === "thread" && dragging.scope === scope) {
        return dragging.ids;
      }
      return threadOrders.orderForScope(scope);
    },
    [drag.state, threadOrders.orderForScope],
  );

  const sections = useMemo<ProjectSectionData[]>(
    () =>
      buildSections(
        visible,
        displayProjects,
        (thread) => lifecycle.shelfFor(thread, descendantsById.get(thread.id) ?? []),
        effectiveOrderForScope,
      ),
    [descendantsById, displayProjects, effectiveOrderForScope, lifecycle, visible],
  );
  sectionsRef.current = sections;

  const sectionsById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );
  const sectionByThreadId = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) {
      for (const thread of section.members) map.set(thread.id, section.id);
    }
    return map;
  }, [sections]);

  const onThreadDragStart = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      section: ProjectSectionData,
      thread: PluginSidebarThread,
      shelf: ThreadShelf,
      pinKey: string,
    ) => {
      const scope = scopeOf(section, thread.id);
      const ageGroups = section.personal && shelf === "active"
        ? personalAgeGroups(section, now) : null;
      const ids = flattenShelf(section, shelf, (id) => expandedParents.has(id))
        .filter((row) => scopeOf(section, row.thread.id) === scope)
        .filter((row) => ageGroups === null || ageGroups.get(row.thread.id) === ageGroups.get(thread.id))
        .map((row) => row.thread.id);
      drag.startThread(event, section.id, scope, ids, thread.id, pinKey);
    },
    [drag, expandedParents, now],
  );

  // Connected focus after a row moves.
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedThread = useRef<string | null>(null);
  const handleFocusCapture = useCallback(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-thread-focus-id]",
      );
      const id = row?.getAttribute("data-thread-focus-id");
      if (id) lastFocusedThread.current = id;
    },
    [],
  );
  const focusThread = useCallback((threadId: string, fallbackKey: string | null) => {
    const attempt = (triesLeft: number) => {
      const container = listRef.current;
      if (container === null) return;
      const row = container.querySelector<HTMLElement>(
        `[data-thread-focus-id="${cssEscape(threadId)}"]`,
      );
      if (row !== null) {
        row.focus();
        return;
      }
      if (fallbackKey !== null) {
        const toggle = container.querySelector<HTMLElement>(
          `[data-shelf-toggle="${cssEscape(fallbackKey)}"]`,
        );
        if (toggle !== null) {
          toggle.focus();
          return;
        }
      }
      // Restoring an unassigned thread may move it into a folded date range.
      if (fallbackKey === null) {
        const section = sectionsRef.current.find((candidate) => candidate.personal && candidate.shelfById.get(threadId) === "active");
        const group = section && personalAgeGroups(section, Date.now()).get(threadId);
        if (section && group) {
          const toggle = container.querySelector<HTMLElement>(
            `[data-shelf-toggle="${cssEscape(ageGroupKey(section.id, group))}"]`,
          );
          if (toggle) {
            toggle.focus();
            return;
          }
        }
      }
      const previousId = lastFocusedThread.current;
      const previous =
        previousId === null
          ? null
          : container.querySelector<HTMLElement>(
              `[data-thread-focus-id="${cssEscape(previousId)}"]`,
            );
      if (previous !== null) {
        previous.focus();
        return;
      }
      if (triesLeft > 0) {
        requestAnimationFrame(() => attempt(triesLeft - 1));
        return;
      }
      container.querySelector<HTMLElement>("[data-thread-focus-id]")?.focus();
    };
    requestAnimationFrame(() => attempt(2));
  }, []);

  // The active thread's display position, for a one-shot reveal.
  const reveal = useMemo(() => {
    if (activeThreadId === null) return null;
    const sectionId = sectionByThreadId.get(activeThreadId);
    if (sectionId === undefined) return null;
    const section = sectionsById.get(sectionId);
    if (section === undefined) return null;
    const ancestors: string[] = [];
    const seen = new Set<string>([activeThreadId]);
    let parentId = section.forest.parent.get(activeThreadId) ?? null;
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      ancestors.push(parentId);
      parentId = section.forest.parent.get(parentId) ?? null;
    }
    const age = section.personal ? personalAgeGroups(section, now).get(activeThreadId) : undefined;
    return {
      sectionId,
      ageKey: age ? ageGroupKey(sectionId, age) : null,
      shelf: section.shelfById.get(activeThreadId) ?? "active",
      ancestors,
    };
  }, [activeThreadId, now, sectionByThreadId, sectionsById]);

  // Reveal once per navigation (and once when the store finishes loading).
  // Pending is tracked separately: if data has not arrived, the request stays
  // pending rather than being consumed, and user folding is respected after.
  const lastSeenThread = useRef<string | null | undefined>(undefined);
  const revealPending = useRef(false);
  const lastReady = useRef(false);
  useEffect(() => {
    const ready = lifecycleStatus === "ready";
    if (lastSeenThread.current !== activeThreadId) {
      lastSeenThread.current = activeThreadId;
      revealPending.current = true;
    }
    if (ready && !lastReady.current) revealPending.current = true;
    lastReady.current = ready;
    if (!revealPending.current || reveal === null) return;
    revealPending.current = false;
    if (reveal.shelf === "settled") {
      settledDrawer.show();
    } else {
      collapsedProjects.remove(reveal.sectionId);
      if (reveal.ageKey) expandedAges.add(reveal.ageKey);
    }
    setExpandedParents((current) => {
      if (reveal.ancestors.every((id) => current.has(id))) return current;
      const next = new Set(current);
      for (const id of reveal.ancestors) next.add(id);
      return next;
    });
  }, [activeThreadId, expandedAges, collapsedProjects, lifecycleStatus, reveal, settledDrawer]);

  // Ctrl+Alt+S settles exactly the active thread, never a parent on its behalf.
  const settlingRef = useRef(false);
  useEffect(() => {
    const onSettle = (event: globalThis.KeyboardEvent) => {
      if (
        status !== "ready" ||
        lifecycleStatus !== "ready" ||
        settlingRef.current ||
        activeThreadId === null ||
        !matchesSettleShortcut(event)
      ) {
        return;
      }
      const thread = visibleById.get(activeThreadId);
      if (thread === undefined) return;
      const descendants = descendantsById.get(thread.id) ?? [];
      if (!lifecycle.canPark(thread, descendants) ||
          lifecycle.shelfFor(thread, descendants) !== "active") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      settlingRef.current = true;
      settledDrawer.show();
      void lifecycle.settle(thread.id).finally(() => {
        settlingRef.current = false;
        focusThread(thread.id, "settled");
      });
    };
    document.addEventListener("keydown", onSettle);
    return () => document.removeEventListener("keydown", onSettle);
  }, [
    activeThreadId,
    descendantsById,
    focusThread,
    lifecycle,
    lifecycleStatus,
    settledDrawer,
    status,
    visibleById,
  ]);

  // Alt+ArrowUp/Down reorders the focused thread among its siblings, or the
  // focused project among native projects, as a keyboard alternative to
  // dragging. It acts only on the element that actually has focus, inside the
  // sidebar list, and never on a composer/input/dialog/menu.
  const moveThreadWithinSiblings = useCallback(
    (threadId: string, shelf: ThreadShelf, pinKey: string, offset: -1 | 1) => {
      const sectionId = sectionByThreadId.get(threadId);
      if (sectionId === undefined) return false;
      const section = sectionsById.get(sectionId);
      if (section === undefined) return false;
      const scope = scopeOf(section, threadId);
      const ageGroups = section.personal && shelf === "active"
        ? personalAgeGroups(section, now) : null;
      const all = flattenShelf(section, shelf, (id) => expandedParents.has(id))
        .filter((row) => scopeOf(section, row.thread.id) === scope)
        .filter((row) => ageGroups === null || ageGroups.get(row.thread.id) === ageGroups.get(threadId))
        .map((row) => row.thread.id);
      const pinOf = (id: string) => (visibleById.get(id)?.isPinned ? "1" : "0");
      const pinned = all.filter((id) => pinOf(id) === "1");
      const unpinned = all.filter((id) => pinOf(id) === "0");
      const nextPinned =
        pinKey === "1" ? moveIdByOffset(pinned, threadId, offset) : pinned;
      const nextUnpinned =
        pinKey === "0" ? moveIdByOffset(unpinned, threadId, offset) : unpinned;
      const nextAll = [...nextPinned, ...nextUnpinned];
      if (nextAll.join("\0") === all.join("\0")) return false;
      const base = section.scopeIds.get(scope) ?? all;
      const global = reconcileOrder(threadOrders.orderForScope(scope), base);
      void threadOrders.reorder(scope, mergeVisibleOrder(global, nextAll));
      const partition = pinKey === "1" ? nextPinned : nextUnpinned;
      const moved = visibleById.get(threadId);
      setAnnouncement(
        `Moved ${moved ? threadDisplayTitle(moved) : threadId} to position ${
          partition.indexOf(threadId) + 1
        } of ${partition.length}`,
      );
      return true;
    },
    [expandedParents, now, sectionByThreadId, sectionsById, threadOrders, visibleById],
  );

  const moveProjectWithinNative = useCallback(
    (projectId: string, offset: -1 | 1) => {
      if (!reorderableProjectIds.includes(projectId)) return false;
      const next = moveIdByOffset(reorderableProjectIds, projectId, offset);
      if (next.join("\0") === reorderableProjectIds.join("\0")) return false;
      onDragCommit({
        kind: "project",
        sectionId: "",
        scope: "",
        movingId: projectId,
        ids: next,
        overId: null,
        placement: null,
      });
      setAnnouncement(
        `Moved project ${
          displayProjects.find((project) => project.id === projectId)?.name ?? projectId
        } to position ${next.indexOf(projectId) + 1} of ${next.length}`,
      );
      return true;
    },
    [displayProjects, onDragCommit, reorderableProjectIds],
  );

  const handleListKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      const target = event.target as Element | null;
      if (isProtectedInteractionTarget(target)) return;
      const offset: -1 | 1 = event.key === "ArrowUp" ? -1 : 1;
      const projectElement = target?.closest("[data-reorder-kind='project']") ?? null;
      if (projectElement !== null) {
        const projectId = projectElement.getAttribute("data-reorder-id");
        if (projectId !== null && moveProjectWithinNative(projectId, offset)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const row = target?.closest("[data-reorder-kind='thread']") ?? null;
      if (row === null) return;
      const threadId = row.getAttribute("data-reorder-id");
      if (threadId === null) return;
      const shelf: ThreadShelf =
        row.getAttribute("data-thread-shelf") === "settled" ? "settled" : "active";
      const pinKey = row.getAttribute("data-reorder-pin") ?? "0";
      if (moveThreadWithinSiblings(threadId, shelf, pinKey, offset)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [moveProjectWithinNative, moveThreadWithinSiblings],
  );

  // Clear the optimistic project order once the native reorderable order
  // matches it (ignoring the implicit personal container).
  useEffect(() => {
    if (projectOverride === null || status !== "ready") return;
    const native = projects
      .filter((project) => !project.isPersonal)
      .map((project) => project.id);
    const target = projectOverride.filter((id) => !personalProjectIds.has(id));
    if (native.join("\0") === target.join("\0")) setProjectOverride(null);
  }, [personalProjectIds, projectOverride, projects, status]);

  const ctx = useMemo<TreeContext>(
    () => ({
      visibleById,
      descendantsById,
      activeThreadId,
      expandedParents,
      expandedAgeGroups: expandedAges.ids,
      onToggleAgeGroup: expandedAges.toggle,
      lifecycle,
      lifecycleStatus,
      isPending,
      now,
      onNavigate,
      onToggleChildren: toggleChildren,
      focusThread,
      openSettledDrawer: settledDrawer.show,
      onThreadDragStart,
      consumeSuppressedClick: drag.consumeSuppressedClick,
      draggingThreadId: drag.state?.kind === "thread" ? drag.state.movingId : null,
      dropTarget:
        drag.state?.kind === "thread" && drag.state.overId !== null
          ? { id: drag.state.overId, placement: drag.state.placement ?? "after" }
          : null,
    }),
    [
      activeThreadId,
      expandedAges,
      descendantsById,
      drag.consumeSuppressedClick,
      drag.state,
      expandedParents,
      focusThread,
      isPending,
      lifecycle,
      lifecycleStatus,
      now,
      onNavigate,
      onThreadDragStart,
      settledDrawer.show,
      toggleChildren,
      visibleById,
    ],
  );

  if (status === "loading") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-6">
        <p role="status" className="text-center text-xs text-muted-foreground">
          Loading threads…
        </p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-6">
        <p role="status" className="text-center text-xs text-muted-foreground">
          Could not load threads.
        </p>
      </div>
    );
  }

  const filteredSections = [
    ...sections.filter((section) => !section.personal && !hiddenProjects.ids.has(section.id)),
    ...sections.filter((section) => section.personal),
  ];
  const projectSections = filteredSections.filter(
    (section) =>
      section.personal || section.byShelf.active.length > 0 ||
      (section.known && section.members.length === 0),
  );
  const settledSections = filteredSections.filter(
    (section) => section.byShelf.settled.length > 0,
  );
  const settledCount = settledSections.reduce(
    (count, section) => count + section.byShelf.settled.length,
    0,
  );

  return (
    <div data-project-sidebar-root="" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center px-1.5 pb-1 pt-1">
        <ProjectChecklist
          projects={sections.filter((section) => !section.personal)}
          hiddenIds={hiddenProjects.ids}
          onVisibilityChange={(id, shown) => shown ? hiddenProjects.remove(id) : hiddenProjects.add(id)}
        />
      </div>

      {lifecycleStatus === "error" ? (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b border-sidebar-border px-2.5 py-1 text-2xs text-muted-foreground"
        >
          <span className="min-w-0 flex-1">
            Could not load settled threads. All threads are shown as active.
          </span>
          <button
            type="button"
            onClick={() => retry()}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-sidebar-accent"
          >
            Retry
          </button>
        </div>
      ) : lifecycleStatus === "loading" ? (
        <p role="status" className="shrink-0 px-2.5 py-1 text-2xs text-muted-foreground/70">
          Loading settled threads…
        </p>
      ) : null}
      {lifecycleError !== null ? (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-b border-sidebar-border px-2.5 py-1 text-2xs text-destructive"
        >
          <span className="min-w-0 flex-1 truncate" title={lifecycleError}>
            {lifecycleError}
          </span>
          <button
            type="button"
            onClick={() => dismissError()}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-sidebar-accent"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div
        ref={listRef}
        onScroll={handleScroll}
        data-scrolling={scrolling}
        onFocusCapture={handleFocusCapture}
        onKeyDown={handleListKeyDown}
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 [scrollbar-width:auto] [scrollbar-color:auto] [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-foreground/20 data-[scrolling=true]:[&::-webkit-scrollbar-thumb]:bg-foreground/20 [&::-webkit-scrollbar-thumb:hover]:bg-foreground/40"
      >
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
          <AnimatedList as="div">
            {projectSections.map((section) => (
              <ProjectSection
                key={section.id}
                section={section}
                ctx={ctx}
                sectionOpen={isProjectOpen(collapsedProjects.ids, section.id)}
                onToggleProject={() => collapsedProjects.toggle(section.id)}
                onNewThread={
                  section.known
                    ? () => {
                        actions.openNewThread({ projectId: section.id });
                        onNavigate();
                      }
                    : undefined
                }
                canDragProject={
                  section.known && !section.personal
                }
                isDragging={drag.state?.kind === "project" && drag.state.movingId === section.id}
                dropPlacement={
                  drag.state?.kind === "project" && drag.state.overId === section.id
                    ? drag.state.placement
                    : null
                }
                onHeadingDragStart={(event) => {
                  drag.startProject(event, reorderableProjectIds, section.id);
                }}
              />
            ))}
              <SettledSection
                open={settledDrawer.open}
                count={settledCount}
                onToggle={settledDrawer.toggle}
                sections={settledSections}
                ctx={ctx}
              />
          </AnimatedList>
      </div>
    </div>
  );
}

function ProjectSection({
  section,
  ctx,
  sectionOpen,
  onToggleProject,
  onNewThread,
  canDragProject,
  isDragging,
  dropPlacement,
  onHeadingDragStart,
}: {
  section: ProjectSectionData;
  ctx: TreeContext;
  sectionOpen: boolean;
  onToggleProject: () => void;
  onNewThread?: (() => void) | undefined;
  canDragProject: boolean;
  isDragging: boolean;
  dropPlacement: DropPlacement | null;
  onHeadingDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  if (section.personal) {
    if (section.byShelf.active.length === 0) return null;
    return (
      <section aria-label="Unassigned threads" className="mt-4">
        <ShelfList section={section} shelf="active" ctx={ctx} />
      </section>
    );
  }
  return (
    <section
      aria-label={section.name}
      data-dragging={isDragging ? "true" : undefined}
      className={cn(
        "mt-4 first:mt-0 transition-opacity duration-150 ease-out motion-reduce:transition-none",
        !sectionOpen && "[&+section]:mt-2",
        isDragging && "opacity-50",
      )}
    >
      <div
        data-reorder-id={canDragProject ? section.id : undefined}
        data-reorder-kind={canDragProject ? "project" : undefined}
        onPointerDown={canDragProject ? onHeadingDragStart : undefined}
        className={cn("group/heading relative flex items-center gap-1 px-1.5", sectionOpen && "mb-1")}
      >
        {dropPlacement !== null ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-1 z-20 h-0.5 rounded-full bg-primary",
              dropPlacement === "before" ? "-top-px" : "-bottom-px",
            )}
          />
        ) : null}
        <button
          type="button"
          title={section.name}
          aria-expanded={sectionOpen}
          onClick={() => {
            if (ctx.consumeSuppressedClick(section.id)) return;
            onToggleProject();
          }}
          className="flex min-h-6 min-w-0 flex-1 items-center gap-1 rounded py-0.5 text-left text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
        >
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {section.name}
            {section.known ? null : (
              <span className="text-muted-foreground/50"> (unknown)</span>
            )}
          </span>
          <span className="flex size-4 shrink-0 items-center justify-center max-md:pointer-coarse:size-9">
            <Icon
              name={sectionOpen ? "ChevronDown" : "ChevronRight"}
              className="size-3 opacity-0 transition-opacity group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 focus-visible:opacity-100 max-md:pointer-coarse:size-5 max-md:pointer-coarse:opacity-100"
            />
          </span>
        </button>
        {onNewThread ? (
          <button
            type="button"
            aria-label={`New thread in ${section.name}`}
            title={`New thread in ${section.name}`}
            onClick={() => {
              if (ctx.consumeSuppressedClick(section.id)) return;
              onNewThread();
            }}
            className={cn(
              "flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
              "max-md:pointer-coarse:size-9",
              "opacity-0 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 focus-visible:opacity-100 max-md:pointer-coarse:opacity-100",
            )}
          >
            <Icon name="Plus" className="size-3.5 max-md:pointer-coarse:size-5" />
          </button>
        ) : null}
      </div>

      {!sectionOpen ? null : section.byShelf.active.length === 0 ? (
        <p className="px-3 py-1 text-2xs text-muted-foreground/60">No threads</p>
      ) : (
        <ShelfList section={section} shelf="active" ctx={ctx} />
      )}
    </section>
  );
}

function SettledSection({
  open,
  count,
  onToggle,
  sections,
  ctx,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
  sections: readonly ProjectSectionData[];
  ctx: TreeContext;
}) {
  return (
    <section aria-label="Settled" className="mt-2">
      <SectionDivider label="Settled" open={open} onToggle={onToggle} shelfKey="settled" />
      {open && count === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground/60">No settled threads in visible projects</p> : null}
      {open
        ? sections.map((section) => (
            <section
              key={section.id}
              aria-label={`Settled from ${section.name}`}
              className="mt-4"
            >
              <h3
                title={section.name}
                className="mb-1 truncate px-1.5 text-xs font-normal text-muted-foreground/70"
              >
                {section.name}
              </h3>
              <ShelfList section={section} shelf="settled" ctx={ctx} />
            </section>
          ))
        : null}
    </section>
  );
}
