import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { SidebarActions } from "./SidebarActions";
import { NewProjectAction } from "./NewProjectAction";
import { isProtectedInteractionTarget } from "./settle-shortcut";
import {
  activePathIds,
  buildPooledOrdinarySection,
  buildSections,
  flattenShelf,
  scopeOf,
  type ProjectSectionData,
  type SiblingOrdering,
} from "./forest";
import { ShelfList, PinnedList, collectLiftedPins, type TreeContext } from "./ThreadTree";
import { descendantsOf, resolveThreadDisplayTitles, threadDisplayTitle, visibleInboxThreads } from "./inbox";
import {
  chatsFolderRegistry,
  homeKindOf,
  nativeProjectSectionId,
  NATIVE_PROJECT_PREFIX,
  projectThreadView,
  STANDALONE,
} from "./membership";
import {
  summarizeSection,
  worstThreadStatus,
  type ThreadStatusKind,
} from "./status";
import { pinAllowed, planPinWrites } from "./pin-scope";
import {
  CONVERSATION_PAGE_SIZE,
  DEFAULT_INACTIVE_CONVERSATIONS,
  planConversations,
} from "./conversations";
import { useWorkspaces } from "./useWorkspaces";
import { usePrimaryHost } from "./usePrimaryHost";
import { useProjectIcons } from "./useProjectIcons";
import { ProjectIconPicker } from "./ProjectIconPicker";
import { CreateNativeProjectDialog, DeleteProjectDialog } from "./CreateNativeProjectDialog";
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
  EXPANDED_AGES_KEY,
  COLLAPSED_GROUPS_KEY,
  EXPANDED_THREADS_KEY,
  usePersistentIds,
} from "./collapse";
import { useThreadSections } from "./useThreadSections";
import { useSidebarView } from "./useSidebarView";
import { SidebarViewMenu, SidebarViewSyncNotice } from "./SidebarViewMenu";
import {
  environmentFilterOptions,
  filterOrdinaryThreads,
  ordinaryCollapsibleTargets,
  ordinaryFamilyGroupKeys,
  ordinaryThreadStatus,
  environmentIdentityOf,
  environmentGroupOf,
  NO_ENVIRONMENT_KEY,
  unreadOrdinaryThreadIds,
  viewHasActiveFilters,
} from "./sidebar-view";
import { DeleteFolderDialog, FolderNameDialog } from "./FolderDialogs";
import {
  familyIds,
  familyRootId,
  planFolderMove,
  standaloneGroupKey,
  type FolderMoveResult,
} from "./standalone-groups";
import type { ThreadShelf } from "./lifecycle";
import { ageGroupKey, personalAgeGroups, type AgeGroup } from "./age-groups";
import { ProjectStatusGlyph, ACTIVITY_LABELS, glyphStateForStatus } from "./ProjectStatusGlyph";
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
  const { status, threads: rawThreads, projects: nativeProjects } = useSidebarThreads();
  const nativeProjectSections = useMemo(
    () => nativeProjects.filter((project) => !project.isPersonal).map((project) => ({ id: nativeProjectSectionId(project.id), name: project.name, isPersonal: false })),
    [nativeProjects],
  );
  const projects = useMemo(
    () => [...nativeProjectSections, { id: STANDALONE, name: "Chats", isPersonal: true }],
    [nativeProjectSections],
  );
  const projectedThreads = useMemo(() => projectThreadView(rawThreads, nativeProjects), [rawThreads, nativeProjects]);
  const threads = useMemo(() => resolveThreadDisplayTitles(projectedThreads), [projectedThreads]);
  const projectedById = useMemo(() => new Map(projectedThreads.map((thread) => [thread.id, thread])), [projectedThreads]);
  const workspacePaths = useWorkspaces(rawThreads);
  const primaryHostId = usePrimaryHost();
  const rawById = useMemo(() => new Map(rawThreads.map((thread) => [thread.id, thread])), [rawThreads]);
  const [creatingProject, setCreatingProject] = useState(false);
  const threadOrders = useThreadOrders();
  const threadOrdersRef = useRef(threadOrders);
  threadOrdersRef.current = threadOrders;
  const actions = useSidebarThreadActions();
  const projectIcons = useProjectIcons();

  // "Today +" opens BB's native composer with the personal project selected —
  // the projectless "Don't work in a project" mode. Naming it explicitly
  // overrides the remembered root-compose project so a new thread never lands
  // in whatever project was last used.
  const personalProjectId = useMemo(
    () => nativeProjects.find((project) => project.isPersonal)?.id ?? null,
    [nativeProjects],
  );
  const onNewThread = useCallback(() => {
    actions.openNewThread({
      ...(personalProjectId === null ? {} : { projectId: personalProjectId }),
      focusPrompt: true,
    });
    onNavigate();
  }, [actions, onNavigate, personalProjectId]);

  const nativeChatProjects = useMemo(
    () => nativeProjects.filter((project) => !project.isPersonal).map((project) => ({ id: project.id, name: project.name })),
    [nativeProjects],
  );
  const openNativeProjectChat = useCallback((project: { id: string; name: string }) => {
    actions.openNewThread({ projectId: project.id, focusPrompt: true });
    onNavigate();
  }, [actions, onNavigate]);

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

  const expandedProjects = usePersistentIds("bb-plugin-project-sidebar:expanded-projects:v1");
  // Fresh devices open Today/Yesterday so populated recency is visible. Any
  // stored value, including an explicitly empty one, is kept and never
  // reseeded; a fold afterwards sticks for the whole mount.
  const expandedAges = usePersistentIds(EXPANDED_AGES_KEY, [
    ageGroupKey(STANDALONE, "Today"),
    ageGroupKey(STANDALONE, "Yesterday"),
  ]);
  const collapsedGroups = usePersistentIds(COLLAPSED_GROUPS_KEY);
  // Top-level group headings (Projects) default open; this set holds the
  // folded ones and is a device preference, not shared state. Loose chats
  // under Projects grouping sit in a Threads subheading that defaults closed.
  const topGroupCollapsed = usePersistentIds("bb-plugin-project-sidebar:collapsed-top-groups:v1");
  const expandedThreads = usePersistentIds(EXPANDED_THREADS_KEY);
  const folderStore = useThreadSections();
  const chatFolders = useMemo(
    () => chatsFolderRegistry(folderStore.sections),
    [folderStore.sections],
  );
  const knownFolderIds = useMemo(
    () => new Set(chatFolders.map((folder) => folder.id)),
    [chatFolders],
  );
  const folderNameOf = useCallback(
    (sectionId: string): string | null =>
      folderStore.sections.find((folder) => folder.id === sectionId)?.name ?? null,
    [folderStore.sections],
  );
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string; chats: number } | null>(null);
  const [iconPicker, setIconPicker] = useState<{ projectId: string; name: string; anchor: HTMLElement } | null>(null);

  const [announcement, setAnnouncement] = useState("");
  const [markReadBusy, setMarkReadBusy] = useState(false);
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

  const visible = useMemo(() => visibleInboxThreads(threads), [threads]);
  const visibleById = useMemo(
    () => new Map(visible.map((thread) => [thread.id, thread])),
    [visible],
  );
  // Row activity includes the whole real subtree even when children are folded.
  const descendantsById = useMemo(() => {
    const map = new Map<string, readonly PluginSidebarThread[]>();
    for (const thread of visible) {
      map.set(thread.id, descendantsOf(visible, thread.id));
    }
    return map;
  }, [visible]);

  // Defined after the section memos; the drag commit reads it at drop time.
  const commitFolderPinDropRef = useRef<(movingId: string, moveToSection: string | null | undefined, pin: boolean | undefined) => Promise<void>>(async () => {});
  const applyFolderMoveRef = useRef<(threadId: string, sectionId: string | null) => Promise<FolderMoveResult>>(async () => {
    throw new Error("Standalone chats are unavailable.");
  });

  const canPin = useCallback((threadId: string) => {
    const projected = projectedById.get(threadId);
    if (!projected) return false;
    return pinAllowed(homeKindOf(projected.projectId), projected.isArchived, false);
  }, [projectedById]);

  // Commit a released drag into the persistent stores.
  const sectionsRef = useRef<ProjectSectionData[]>([]);
  // True while the stored manual conversation order is the active order; an
  // automatic order discards a pure reorder drop but keeps filing and pinning.
  const manualOrderRef = useRef(true);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const onDragCommit = useCallback(
    (committed: ReorderDragState) => {
      if (
        committed.kind === "thread" &&
        committed.moveToSection === undefined &&
        committed.pin === undefined &&
        !manualOrderRef.current
      ) {
        return;
      }
      // Folder and pin headers own the drop: the family is filed or (un)pinned
      // with native state, never reordered across clusters and never moved
      // between projects. SDK cannot change a thread's projectId.
      if (committed.kind === "thread" && (committed.moveToSection !== undefined || committed.pin !== undefined)) {
        void commitFolderPinDropRef.current(committed.movingId, committed.moveToSection, committed.pin);
        return;
      }
      if (committed.kind === "project") {
        const ids = mergeVisibleOrder(
          projectsRef.current.filter((project) => !project.isPersonal && project.id.startsWith(NATIVE_PROJECT_PREFIX)).map((project) => project.id),
          committed.ids,
        );
        void threadOrdersRef.current.reorder("managed-projects", ids);
        return;
      }
      const section = sectionsRef.current.find(
        (candidate) => candidate.id === committed.sectionId,
      );
      if (section === undefined) return;
      // Reconcile the stored order against the complete current scope before
      // merging: new siblings and folded siblings keep a slot instead
      // of being dropped from the saved order.
      const base = section.scopeIds.get(committed.scope) ?? committed.ids;
      const stored = threadOrdersRef.current.orderForScope(committed.scope);
      const global = reconcileOrder(stored, base);
      void threadOrdersRef.current.reorder(
        committed.scope,
        mergeVisibleOrder(global, committed.ids),
      );
    },
    [],
  );
  const drag = useReorderDrag(onDragCommit);

  // Project order is a plugin overlay; native storage projects stay unchanged.
  const baseOrderedProjects = useMemo(
    () => orderByStoredIds(projects, threadOrders.orderForScope("managed-projects")),
    [threadOrders.orderForScope, projects],
  );
  const baseProjectIds = useMemo(
    () => baseOrderedProjects.map((project) => project.id),
    [baseOrderedProjects],
  );
  const reorderableProjectIds = useMemo(
    () => baseOrderedProjects.filter((project) => !project.isPersonal && project.id.startsWith(NATIVE_PROJECT_PREFIX)).map((project) => project.id),
    [baseOrderedProjects],
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
        name: project.isPersonal ? "Chats" : project.name,
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

  // One persisted SidebarView drives grouping, ordering, Show and the ordinary
  // filters. It never touches homes, folders, pin flags or manual order: it only
  // decides which ordinary rows render, how they are ordered and grouped, and
  // which supported metadata a row shows.
  const sidebarView = useSidebarView();
  const view = sidebarView.view;
  manualOrderRef.current = true;
  const familyRootOfId = useCallback(
    (threadId: string) =>
      familyRootId((id) => rawById.get(id)?.parentThreadId ?? null, threadId),
    [rawById],
  );
  // A pinned family and the open chat's family stay visible when an ordinary
  // filter would hide them, with the header note explaining the exception.
  const pinnedFamilyRoots = useMemo(() => {
    const roots = new Set<string>();
    for (const thread of visible) {
      if (thread.isPinned) roots.add(familyRootOfId(thread.id));
    }
    return roots;
  }, [familyRootOfId, visible]);
  const activeFamilyRoot = useMemo(
    () => (activeThreadId === null ? null : familyRootOfId(activeThreadId)),
    [activeThreadId, familyRootOfId],
  );
  const viewFiltersActive = viewHasActiveFilters(view);
  // Projects grouping keeps native project interiors unfiltered; every other
  // grouping filters project threads exactly like standalone chats.
  const projectsGrouping = view.groupBy === "workspace";
  const viewVisible = useMemo(
    () =>
      filterOrdinaryThreads(visible, view, {
        bypass: (thread) => {
          if (projectsGrouping && homeKindOf(thread.projectId) === "project") return true;
          const root = familyRootOfId(thread.id);
          return pinnedFamilyRoots.has(root) || root === activeFamilyRoot;
        },
      }),
    [activeFamilyRoot, familyRootOfId, pinnedFamilyRoots, projectsGrouping, visible, view],
  );
  const viewEnvironmentOptions = useMemo(
    () => environmentFilterOptions(visible),
    [visible],
  );
  const hasEnvironmentlessOrdinary = useMemo(
    () =>
      visible.some(
        (thread) => environmentGroupOf(thread).id === NO_ENVIRONMENT_KEY,
      ),
    [visible],
  );
  const unreadOrdinary = useMemo(
    () => unreadOrdinaryThreadIds(visible),
    [visible],
  );
  const recencyOrdering = useMemo<SiblingOrdering>(
    () => ({
      compare: (left, right) =>
        right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
      manual: false,
    }),
    [],
  );
  // Native projects stay newest-first. Standalone chats keep stored sibling
  // order. The old Ordering menu is gone; leftover saved sorts are ignored.
  const orderingFor = useCallback(
    (sectionId: string): SiblingOrdering | undefined => {
      if (homeKindOf(sectionId) === "project") return recencyOrdering;
      return undefined;
    },
    [recencyOrdering],
  );

  const sections = useMemo<ProjectSectionData[]>(
    () =>
      buildSections(
        viewVisible,
        displayProjects,
        () => "active",
        effectiveOrderForScope,
        orderingFor,
      ),
    [displayProjects, effectiveOrderForScope, orderingFor, viewVisible],
  );
  sectionsRef.current = sections;
  // Pooled ordinary section for Updated / Status / Environment. Presentation
  // only: homes, pins, folders and order are untouched.
  const pooledSection = useMemo(
    () =>
      buildPooledOrdinarySection(
        sections,
        STANDALONE,
        "Chats",
      ),
    [sections],
  );
  const pooledSectionRef = useRef(pooledSection);
  pooledSectionRef.current = pooledSection;

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

  // The section a row renders in, used for family walks in any ordinary home.
  const homeSectionOf = useCallback((threadId: string): ProjectSectionData | undefined => {
    const sid = sectionByThreadId.get(threadId);
    if (sid === undefined) return undefined;
    return sectionsById.get(sid);
  }, [sectionByThreadId, sectionsById]);

  /** Whole display family ids for one thread, from the section forest. */
  const familyOf = useCallback((threadId: string): string[] => {
    const section = homeSectionOf(threadId);
    if (!section) return [threadId];
    return familyIds(
      (id) => section.forest.parent.get(id) ?? null,
      (id) => (section.forest.children.get(id) ?? []).map((thread) => thread.id),
      threadId,
    );
  }, [homeSectionOf]);

  const moveFamilyToSection = useCallback(async (threadId: string, sectionId: string | null): Promise<FolderMoveResult> => {
    const section = homeSectionOf(threadId);
    const ids = familyOf(threadId);
    const root = section
      ? familyRootId((id) => section.forest.parent.get(id) ?? null, threadId)
      : threadId;
    const rootThread = rawById.get(root);
    const currentSection = rootThread?.sectionId != null && knownFolderIds.has(rootThread.sectionId)
      ? rootThread.sectionId
      : null;
    const wasPinned = rootThread?.isPinned ?? false;
    const plan = planFolderMove(currentSection, sectionId, wasPinned);
    let sectionFailed: string[] = [];
    if (plan.writeSection) sectionFailed = await folderStore.setFamily(ids, sectionId);
    let pinFailed = false;
    // The pin write runs only after a full section write, and never retries:
    // a partial outcome is reported exactly, not papered over.
    if (sectionFailed.length === 0 && plan.writePin) {
      try {
        await actions.setPinned(root, false);
      } catch {
        pinFailed = true;
      }
    }
    return { sectionFailed, pinFailed, wasPinned };
  }, [actions, familyOf, folderStore, knownFolderIds, homeSectionOf, rawById]);
  applyFolderMoveRef.current = moveFamilyToSection;

  /** Announce a filing outcome; returns the error text when it failed. */
  const reportFolderMove = useCallback((
    threadId: string,
    sectionId: string | null,
    result: FolderMoveResult,
  ): string | null => {
    const moved = visibleById.get(threadId);
    const title = moved ? threadDisplayTitle(moved) : "Chat";
    if (result.sectionFailed.length > 0) {
      const total = result.sectionFailed.length >= familyOf(threadId).length;
      return total
        ? `${title} kept its previous folder; pin state untouched.`
        : `${title} partially kept its previous folder; the list shows the host state.`;
    }
    const name = sectionId ? folderNameOf(sectionId) ?? "the folder" : "the dated chats";
    if (result.pinFailed) {
      const message = `${title} moved to ${name}, but the family root stayed pinned.`;
      setAnnouncement(message);
      return message;
    }
    setAnnouncement(
      result.wasPinned
        ? `${title} moved to ${name} and unpinned.`
        : `${title} moved to ${name}.`,
    );
    return null;
  }, [familyOf, folderNameOf, visibleById]);
  const reportFolderMoveRef = useRef(reportFolderMove);
  reportFolderMoveRef.current = reportFolderMove;

  // Pin a family: pinning writes the family root, which lifts the whole family
  // into the home's Pinned group. Unpinning clears every member's pin (a child
  // pin also lifts a family), reporting a partial failure instead of claiming
  // success.
  const applyFamilyPin = useCallback(async (
    threadId: string,
    section: ProjectSectionData | undefined,
    pinned: boolean,
  ): Promise<{ failed: string[] }> => {
    const ids = familyOf(threadId);
    const root = section
      ? familyRootId((id) => section.forest.parent.get(id) ?? null, threadId)
      : threadId;
    const homeKind = section ? homeKindOf(section.id) : "project";
    if (pinned) {
      const writes = planPinWrites({
        homeKind,
        threadId,
        rootId: root,
        familyIds: ids,
        pinnedMemberIds: [],
        pinned: true,
      });
      for (const write of writes) await actions.setPinned(write.threadId, write.pinned);
      return { failed: [] };
    }
    const writes = planPinWrites({
      homeKind,
      threadId,
      rootId: root,
      familyIds: ids,
      pinnedMemberIds: ids.filter((id) => rawById.get(id)?.isPinned ?? false),
      pinned: false,
    });
    const failed: string[] = [];
    for (const write of writes) {
      try {
        await actions.setPinned(write.threadId, write.pinned);
      } catch {
        failed.push(write.threadId);
      }
    }
    return { failed };
  }, [actions, familyOf, rawById]);

  const togglePin = useCallback(async (threadId: string, pinned: boolean): Promise<void> => {
    const section = homeSectionOf(threadId);
    try {
      const { failed } = await applyFamilyPin(threadId, section, pinned);
      const moved = visibleById.get(threadId);
      const title = moved ? threadDisplayTitle(moved) : "Chat";
      if (pinned) {
        setAnnouncement(`${title} pinned.`);
      } else if (failed.length > 0) {
        const message = `${title} unpinned, but ${failed.length} member${failed.length === 1 ? "" : "s"} stayed pinned.`;
        setAnnouncement(message);
        toast.error("Partial unpin", { description: message });
      } else {
        setAnnouncement(`${title} unpinned.`);
      }
    } catch (cause) {
      toast.error(pinned ? "Could not pin the chat" : "Could not unpin the chat", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }, [applyFamilyPin, homeSectionOf, visibleById]);

  // A drag that ends on a folder or pin header files or (un)pins the whole
  // family with native state. Parts that already match are skipped, so
  // dropping a dated chat on its own date divider is a silent no-op. Folder
  // drops always unpin through the shared move; pin-header drops keep filing.
  const commitFolderPinDrop = useCallback(async (
    movingId: string,
    moveToSection: string | null | undefined,
    pin: boolean | undefined,
  ): Promise<void> => {
    const section = homeSectionOf(movingId);
    if (!section || !canPin(movingId)) return;
    if (moveToSection !== undefined) {
      const result = await applyFolderMoveRef.current(movingId, moveToSection);
      const error = reportFolderMoveRef.current(movingId, moveToSection, result);
      if (error !== null) toast.error(error);
      return;
    }
    if (pin === undefined) return;
    const familyLifted = familyOf(movingId).some((id) => rawById.get(id)?.isPinned ?? false);
    if (pin === familyLifted) return;
    try {
      const { failed } = await applyFamilyPin(movingId, section, pin);
      const moved = visibleById.get(movingId);
      const title = moved ? threadDisplayTitle(moved) : "Chat";
      if (!pin && failed.length > 0) {
        const message = `${title} unpinned, but ${failed.length} member${failed.length === 1 ? "" : "s"} stayed pinned.`;
        setAnnouncement(message);
        toast.error("Partial unpin", { description: message });
      } else {
        setAnnouncement(`${title} ${pin ? "pinned" : "unpinned"}.`);
      }
    } catch (cause) {
      toast.error(pin ? "Could not pin the family" : "Could not unpin the family", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }, [applyFamilyPin, canPin, familyOf, homeSectionOf, rawById, visibleById]);
  commitFolderPinDropRef.current = commitFolderPinDrop;

  const onThreadDragStart = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      section: ProjectSectionData,
      thread: PluginSidebarThread,
      shelf: ThreadShelf,
    ) => {
      // A pooled row commits to its native home's scope, never to the display bucket.
      const homeSection = sectionsById.get(sectionByThreadId.get(thread.id) ?? "") ?? section;
      const commitSection = section.id === pooledSectionRef.current.id ? homeSection : section;
      const scope = scopeOf(commitSection, thread.id);
      // Reorder stays inside one visible automatic group, so a drag never
      // crosses groups, files, pins or duplicates a family.
      const memberById = shelf === "active"
        ? new Map(commitSection.members.map((member) => [member.id, member]))
        : null;
      const groupingView =
        commitSection.personal || !projectsGrouping
          ? view
          : { ...view, groupBy: "workspace" as const };
      const groupKeys = memberById === null
        ? null
        : ordinaryFamilyGroupKeys(commitSection.members, groupingView, {
            now,
            parentOf: (id) => commitSection.forest.parent.get(id) ?? null,
            statusOf: ordinaryThreadStatus,
            environmentOf: environmentIdentityOf,
          });
      const groupKeyOf = memberById === null || groupKeys === null ? null : (threadId: string): string => {
        return standaloneGroupKey({
          threadId,
          parentOf: (id) => commitSection.forest.parent.get(id) ?? null,
          sectionIdOf: (id) => memberById.get(id)?.sectionId ?? null,
          isPinned: (id) => memberById.get(id)?.isPinned ?? false,
          knownFolderIds,
          ageGroupOf: (id) => groupKeys.get(id) ?? null,
        });
      };
      const sourceKey = groupKeyOf?.(thread.id) ?? null;
      const ids = flattenShelf(commitSection, shelf, (id) => expandedParents.has(id))
        .filter((row) => scopeOf(commitSection, row.thread.id) === scope)
        .filter((row) => groupKeyOf === null || sourceKey === null || groupKeyOf(row.thread.id) === sourceKey)
        .map((row) => row.thread.id);
      drag.startThread(event, commitSection.id, scope, ids, thread.id);
    },
    [drag, expandedParents, knownFolderIds, now, projectsGrouping, sectionByThreadId, sectionsById, view],
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
      // A project thread falls back to the pooled section when pooled.
      if (fallbackKey === null) {
        const section = sectionsRef.current.find((candidate) => candidate.personal && candidate.shelfById.get(threadId) === "active")
          ?? (pooledSectionRef.current.shelfById.get(threadId) === "active" ? pooledSectionRef.current : undefined);
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
    // The key matches the renderer's, so a reveal opens the real group holding
    // the active family: from the pool when pooled, else the home section.
    let updatedAgeKey: string | null = null;
    let collapsedGroupKey: string | null = null;
    const pooled = !projectsGrouping ? pooledSectionRef.current : null;
    const keyScope = pooled ?? (section.personal ? section : null);
    if (keyScope !== null) {
      const keys = ordinaryFamilyGroupKeys(keyScope.members, view, {
        now,
        parentOf: (id) => keyScope.forest.parent.get(id) ?? null,
        statusOf: ordinaryThreadStatus,
        environmentOf: environmentIdentityOf,
      });
      const key = keys.get(activeThreadId) ?? null;
      if (key !== null && view.groupBy === "updated") {
        updatedAgeKey = ageGroupKey(keyScope.id, key.slice("updated:".length) as AgeGroup);
      } else if (key !== null && (view.groupBy === "status" || view.groupBy === "environment")) {
        collapsedGroupKey = `group:${keyScope.id}:${key}`;
      }
    }
    return {
      sectionId,
      updatedAgeKey,
      collapsedGroupKey,
      shelf: section.shelfById.get(activeThreadId) ?? "active",
      ancestors,
    };
  }, [activeThreadId, now, projectsGrouping, sectionByThreadId, sectionsById, view]);

  // Reveal once per navigation (and once when the store finishes loading).
  // Pending is tracked separately: if data has not arrived, the request stays
  // pending rather than being consumed, and user folding is respected after.
  const lastSeenThread = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Restoring an already-open child route must not override default folds.
    // Subsequent explicit navigation may reveal its actual ancestors once.
    if (lastSeenThread.current === undefined) {
      lastSeenThread.current = activeThreadId;
      return;
    }
    if (lastSeenThread.current === activeThreadId || reveal === null) return;
    lastSeenThread.current = activeThreadId;
    // A hidden/filtered thread reveals its existing home and ancestors, so the
    // group heading that contains it opens rather than duplicating the row.
    if (projectsGrouping && homeKindOf(reveal.sectionId) === "project") {
      topGroupCollapsed.remove("projects");
    } else if (projectsGrouping) {
      topGroupCollapsed.remove("projects");
      expandedThreads.add("threads");
    }
    // Never permanently open a collapsed project on selection: a collapsed
    // project shows only the selected conversation (the exception row) and
    // keeps its stored expansion. Per-conversation ancestor folding below is
    // transient view state, not the persisted project expansion.
    if (reveal.updatedAgeKey) expandedAges.add(reveal.updatedAgeKey);
    if (reveal.collapsedGroupKey) collapsedGroups.remove(reveal.collapsedGroupKey);
    setExpandedParents((current) => new Set([...current, ...reveal.ancestors]));
  }, [activeThreadId, reveal, expandedAges, collapsedGroups, expandedThreads, topGroupCollapsed, projectsGrouping]);

  // Alt+ArrowUp/Down reorders the focused thread among its siblings, or the
  // focused project among native projects, as a keyboard alternative to
  // dragging. It acts only on the element that actually has focus, inside the
  // sidebar list, and never on a composer/input/dialog/menu.
  const moveThreadWithinSiblings = useCallback(
    (threadId: string, shelf: ThreadShelf, offset: -1 | 1) => {
      const sectionId = sectionByThreadId.get(threadId);
      if (sectionId === undefined) return false;
      const section = sectionsById.get(sectionId);
      if (section === undefined) return false;
      // Native projects stay recency-ordered, so they never take a manual
      // sibling move.
      if (homeKindOf(section.id) === "project") return false;
      const scope = scopeOf(section, threadId);
      const memberById = shelf === "active"
        ? new Map(section.members.map((member) => [member.id, member]))
        : null;
      const groupingView = section.personal ? view : { ...view, groupBy: "workspace" as const };
      const groupKeys = memberById === null
        ? null
        : ordinaryFamilyGroupKeys(section.members, groupingView, {
            now,
            parentOf: (id) => section.forest.parent.get(id) ?? null,
            statusOf: ordinaryThreadStatus,
            environmentOf: environmentIdentityOf,
          });
      const groupKeyOf = memberById === null || groupKeys === null ? null : (id: string): string =>
        standaloneGroupKey({
          threadId: id,
          parentOf: (child) => section.forest.parent.get(child) ?? null,
          sectionIdOf: (child) => memberById.get(child)?.sectionId ?? null,
          isPinned: (child) => memberById.get(child)?.isPinned ?? false,
          knownFolderIds,
          ageGroupOf: (child) => groupKeys.get(child) ?? null,
        });
      const sourceKey = groupKeyOf?.(threadId) ?? null;
      const all = flattenShelf(section, shelf, (id) => expandedParents.has(id))
        .filter((row) => scopeOf(section, row.thread.id) === scope)
        .filter((row) => groupKeyOf === null || sourceKey === null || groupKeyOf(row.thread.id) === sourceKey)
        .map((row) => row.thread.id);
      const nextAll = moveIdByOffset(all, threadId, offset);
      if (nextAll.join("\0") === all.join("\0")) return false;
      const base = section.scopeIds.get(scope) ?? all;
      const global = reconcileOrder(threadOrders.orderForScope(scope), base);
      void threadOrders.reorder(scope, mergeVisibleOrder(global, nextAll));
      const partition = nextAll;
      const moved = visibleById.get(threadId);
      setAnnouncement(
        `Moved ${moved ? threadDisplayTitle(moved) : threadId} to position ${
          partition.indexOf(threadId) + 1
        } of ${partition.length}`,
      );
      return true;
    },
    [expandedParents, knownFolderIds, now, sectionByThreadId, sectionsById, threadOrders, view, visibleById],
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
        overTarget: null,
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
      if (moveThreadWithinSiblings(threadId, shelf, offset)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [moveProjectWithinNative, moveThreadWithinSiblings],
  );

  const ctx = useMemo<TreeContext>(
    () => ({
      rawById,
      workspacePaths,
      primaryHostId,
      nativeProjects,
      visibleById,
      descendantsById,
      activeThreadId,
      expandedParents,
      expandedAgeGroups: expandedAges.ids,
      onToggleAgeGroup: expandedAges.toggle,
      onNewThread,
      now,
      onNavigate,
      onToggleChildren: toggleChildren,
      focusThread,
      onThreadDragStart,
      consumeSuppressedClick: drag.consumeSuppressedClick,
      draggingThreadId: drag.state?.kind === "thread" ? drag.state.movingId : null,
      dropTarget:
        drag.state?.kind === "thread" && drag.state.overId !== null
          ? { id: drag.state.overId, placement: drag.state.placement ?? "after" }
          : null,
      threadSections: chatFolders,
      collapsedGroups: collapsedGroups.ids,
      onToggleGroup: collapsedGroups.toggle,
      onRemoveFromFolder: (threadId: string) => {
        void (async () => {
          const result = await applyFolderMoveRef.current(threadId, null);
          const error = reportFolderMoveRef.current(threadId, null, result);
          if (error !== null) toast.error(error);
        })();
      },
      onRenameFolder: setRenamingFolderId,
      onDeleteFolder: setDeletingFolderId,
      onTogglePin: (threadId: string, pinned: boolean) => {
        void togglePin(threadId, pinned);
      },
      canPin,
      view,
      statusOf: (threadId: string) => {
        const thread = visibleById.get(threadId);
        if (thread === undefined) return undefined;
        return worstThreadStatus([thread, ...(descendantsById.get(threadId) ?? [])]);
      },
      folderDropTarget: drag.state?.kind === "thread" ? drag.state.overTarget : null,
    }),
    [
      rawById, workspacePaths, primaryHostId, nativeProjects,
      activeThreadId,
      canPin,
      collapsedGroups,
      togglePin,
      expandedAges,
      descendantsById,
      drag.consumeSuppressedClick,
      drag.state,
      expandedParents,
      focusThread,
      folderStore.available,
      chatFolders,
      now,
      onNavigate,
      onNewThread,
      onThreadDragStart,
      toggleChildren,
      visibleById,
      view,
    ],
  );

  const liftedPins = useMemo(
    () => collectLiftedPins(sections, ctx, projects.map((project) => project.id)),
    [ctx, projects, sections],
  );

  const markAllRead = useCallback(async () => {
    if (unreadOrdinary.length === 0) return;
    setMarkReadBusy(true);
    const ids = unreadOrdinary;
    const results = await Promise.allSettled(ids.map((id) => actions.setRead(id, true)));
    setMarkReadBusy(false);
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) {
      toast.error(`Marked ${ids.length - failed} of ${ids.length} as read.`, {
        description: `${failed} could not be updated.`,
      });
      return;
    }
    const message = `${ids.length} conversation${ids.length === 1 ? "" : "s"} marked read.`;
    setAnnouncement(message);
    toast.success(message);
  }, [actions, unreadOrdinary]);

  // Bulk collapse operates the existing per-client stores over the real
  // collapsible targets the current view renders: the top groups, the rendered
  // project sections, the pinned/folder headers, the generated Status and
  // Environment group keys and the date buckets that actually appear, plus the
  // descendant trees. A key for a group the view does not render is never
  // touched, so unrelated hidden preferences survive.
  const bulkTopGroupKeys = liftedPins.length > 0
    ? ["pinned", "projects"]
    : ["projects"];
  const collapseSections = useMemo(
    () => (projectsGrouping ? sections : [pooledSection]),
    [pooledSection, projectsGrouping, sections],
  );
  const bulkSectionIds = useMemo(
    () => collapseSections.map((section) => section.id),
    [collapseSections],
  );
  const bulkTargets = useMemo(
    () =>
      ordinaryCollapsibleTargets(
        collapseSections.map((section) => ({
          id: section.id,
          isPersonal: section.personal,
          members: section.members,
          childrenOf: (threadId) =>
            (section.forest.children.get(threadId) ?? []).map((thread) => thread.id),
          parentOf: (threadId) => section.forest.parent.get(threadId) ?? null,
        })),
        view,
        {
          now,
          folderIds: knownFolderIds,
          statusOf: ordinaryThreadStatus,
          environmentOf: environmentIdentityOf,
        },
      ),
    [collapseSections, knownFolderIds, now, view],
  );
  const expandAll = useCallback(() => {
    topGroupCollapsed.removeMany(bulkTopGroupKeys);
    expandedThreads.add("threads");
    expandedProjects.addMany(bulkSectionIds);
    collapsedGroups.removeMany(bulkTargets.groupKeys);
    expandedAges.addMany(bulkTargets.ageKeys);
    setExpandedParents((current) => new Set([...current, ...bulkTargets.parentIds]));
  }, [bulkSectionIds, bulkTargets, bulkTopGroupKeys, collapsedGroups, expandedAges, expandedProjects, expandedThreads, topGroupCollapsed]);
  const collapseAll = useCallback(() => {
    topGroupCollapsed.addMany(bulkTopGroupKeys);
    expandedThreads.remove("threads");
    expandedProjects.removeMany(bulkSectionIds);
    collapsedGroups.addMany(bulkTargets.groupKeys);
    expandedAges.removeMany(bulkTargets.ageKeys);
    setExpandedParents((current) => {
      const next = new Set(current);
      for (const id of bulkTargets.parentIds) next.delete(id);
      return next;
    });
  }, [bulkSectionIds, bulkTargets, bulkTopGroupKeys, collapsedGroups, expandedAges, expandedProjects, expandedThreads, topGroupCollapsed]);

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

  const nativeSectionsVisible = sections.filter(
    (section) =>
      !section.personal &&
      (section.byShelf.active.length > 0 || section.byShelf.settled.length > 0 ||
        (section.known && section.members.length === 0)),
  );
  const chatSectionsVisible = sections.filter((section) => section.personal);

  const renamingFolder = renamingFolderId
    ? folderStore.sections.find((folder) => folder.id === renamingFolderId) ?? null
    : null;
  const deletingFolder = deletingFolderId
    ? folderStore.sections.find((folder) => folder.id === deletingFolderId) ?? null
    : null;
  const deletingFolderChats = (() => {
    if (!deletingFolderId) return 0;
    // A folder is global, so its families may sit in any ordinary home. Count
    // each filed family once from the home that renders it.
    const seen = new Set<string>();
    let count = 0;
    for (const section of sections) {
      for (const member of section.members) {
        const root = familyRootId((id) => section.forest.parent.get(id) ?? null, member.id);
        if (seen.has(root)) continue;
        if ((rawById.get(root)?.sectionId ?? null) !== deletingFolderId) continue;
        const stack = [root];
        while (stack.length > 0) {
          const current = stack.pop()!;
          if (seen.has(current)) continue;
          seen.add(current);
          count += 1;
          for (const child of section.forest.children.get(current) ?? []) stack.push(child.id);
        }
      }
    }
    return count;
  })();

  const anyCollapsed =
    bulkTopGroupKeys.some((key) => topGroupCollapsed.ids.has(key)) ||
    (projectsGrouping && !expandedThreads.ids.has("threads")) ||
    bulkSectionIds.some((id) => !expandedProjects.ids.has(id)) ||
    [...bulkTargets.groupKeys].some((key) => collapsedGroups.ids.has(key)) ||
    [...bulkTargets.ageKeys].some((key) => !expandedAges.ids.has(key)) ||
    [...bulkTargets.parentIds].some((id) => !expandedParents.has(id));

  const viewMenu = (
    <SidebarViewMenu
      view={view}
      sync={sidebarView.sync}
      onRetry={sidebarView.retry}
      onUpdate={sidebarView.update}
      onReset={sidebarView.reset}
      environmentOptions={viewEnvironmentOptions}
      showNoEnvironment={hasEnvironmentlessOrdinary}
      anyCollapsed={anyCollapsed}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      unreadOrdinaryCount={unreadOrdinary.length}
      markReadBusy={markReadBusy}
      onMarkAllRead={() => { void markAllRead(); }}
      triggerClassName="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/55 hover:text-foreground data-[state=open]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:size-9"
    />
  );
  const newChatAction = (
    <NewProjectAction
      projects={nativeChatProjects}
      onSelect={openNativeProjectChat}
    />
  );

  const renderSection = (section: ProjectSectionData) => {
    const kind = section.personal ? "chats" : homeKindOf(section.id);
    const sectionThreads = projectedThreads.filter((thread) => thread.projectId === section.id);
    const aggregate = summarizeSection(section.name, sectionThreads);
    const nativeId = section.id.startsWith(NATIVE_PROJECT_PREFIX)
      ? section.id.slice(NATIVE_PROJECT_PREFIX.length)
      : null;
    return (
      <ProjectSection
        key={section.id}
        section={section}
        ctx={ctx}
        status={aggregate.status}
        statusLabel={aggregate.statusLabel}
        onNewThread={
          nativeId !== null && section.known
            ? () => {
                actions.openNewThread({ projectId: nativeId, focusPrompt: true });
                onNavigate();
              }
            : undefined
        }
        sectionOpen={expandedProjects.ids.has(section.id)}
        onToggleProject={() => expandedProjects.toggle(section.id)}
        icon={nativeId !== null ? projectIcons.iconFor(nativeId) : null}
        onSetIcon={
          kind === "project" && nativeId !== null
            ? (anchor) => setIconPicker({ projectId: nativeId, name: section.name, anchor })
            : undefined
        }
        onDeleteProject={
          kind === "project" && nativeId !== null && section.known
            ? () => setDeletingProject({ id: nativeId, name: section.name, chats: sectionThreads.length })
            : undefined
        }
        canDragProject={kind === "project" && section.known}
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
    );
  };

  return (
    <div data-project-sidebar-root="" className="flex min-h-0 flex-1 flex-col">
      <SidebarViewSyncNotice sync={sidebarView.sync} onRetry={sidebarView.retry} className="ps-view-sync-notice" />

      {viewFiltersActive ? (
        <p
          role="status"
          className="ps-filter-note px-3 pb-1 text-2xs leading-tight text-muted-foreground/60"
        >
          Pinned and the open chat ignore the status and environment filters. Folders, pins and membership are unchanged.
        </p>
      ) : null}

      <div
        ref={listRef}
        onScroll={handleScroll}
        data-scrolling={scrolling}
        onFocusCapture={handleFocusCapture}
        onKeyDown={handleListKeyDown}
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-2 pb-4 [scrollbar-width:auto] [scrollbar-color:auto] [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-foreground/20 data-[scrolling=true]:[&::-webkit-scrollbar-thumb]:bg-foreground/20 [&::-webkit-scrollbar-thumb:hover]:bg-foreground/40"
      >
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
          {creatingProject ? <CreateNativeProjectDialog
            onClose={() => setCreatingProject(false)}
            onCreated={(project) => {
              setCreatingProject(false);
              toast.success(`Project ${project.name} is ready.`);
            }} /> : null}
          {renamingFolder ? <FolderNameDialog
            folder={renamingFolder}
            onClose={() => setRenamingFolderId(null)}
            onRename={async (name) => folderStore.rename(renamingFolder.id, name)} /> : null}
          {deletingProject ? <DeleteProjectDialog
            project={deletingProject}
            chatCount={deletingProject.chats}
            onClose={() => setDeletingProject(null)}
            onDeleted={() => {
              setDeletingProject(null);
              setAnnouncement(`Project ${deletingProject.name} deleted.`);
            }} /> : null}
          {deletingFolder ? <DeleteFolderDialog
            folder={deletingFolder}
            chatCount={deletingFolderChats}
            onClose={() => setDeletingFolderId(null)}
            onDelete={async () => {
              const removed = await folderStore.remove(deletingFolder.id);
              if (removed === null) throw new Error("The folder was not deleted.");
              setAnnouncement(`Folder ${deletingFolder.name} deleted. Its chats returned to the dated chats.`);
            }} /> : null}
          <ProjectIconPicker
            open={iconPicker !== null}
            onOpenChange={(next) => {
              if (!next) setIconPicker(null);
            }}
            anchor={iconPicker?.anchor ?? null}
            projectName={iconPicker?.name ?? ""}
            current={iconPicker === null ? null : projectIcons.iconFor(iconPicker.projectId)}
            onPick={(icon) => {
              if (iconPicker !== null) projectIcons.setIcon(iconPicker.projectId, icon);
              setIconPicker(null);
            }}
          />
          <AnimatedList as="div">
            {liftedPins.length > 0 ? (
              <>
                <GroupHeading
                  label="Pinned"
                  open={!topGroupCollapsed.ids.has("pinned")}
                  onToggle={() => topGroupCollapsed.toggle("pinned")}
                  tools={
                    <>
                      {viewMenu}
                      {!projectsGrouping ? newChatAction : null}
                    </>
                  }
                />
                {!topGroupCollapsed.ids.has("pinned") ? (
                  <PinnedList items={liftedPins} ctx={ctx} />
                ) : null}
              </>
            ) : null}
            {projectsGrouping ? (
              <>
                <GroupHeading
                  label="Projects"
                  open={!topGroupCollapsed.ids.has("projects")}
                  onToggle={() => topGroupCollapsed.toggle("projects")}
                  onCreate={() => setCreatingProject(true)}
                  createLabel="New Project"
                  tools={liftedPins.length === 0 ? viewMenu : undefined}
                />
                {!topGroupCollapsed.ids.has("projects") ? (
                  <>
                    {nativeSectionsVisible.map((section) => renderSection(section))}
                    <GroupHeading
                      label="Threads"
                      open={expandedThreads.ids.has("threads")}
                      onToggle={() => expandedThreads.toggle("threads")}
                    />
                    {expandedThreads.ids.has("threads")
                      ? chatSectionsVisible.map((section) => renderSection(section))
                      : null}
                  </>
                ) : null}
              </>
            ) : (
              <>
                <section aria-label="Threads" className="mb-1 mt-3 min-h-8 first:mt-0">
                  <ShelfList
                    section={pooledSection}
                    shelf="active"
                    ctx={ctx}
                    grouped
                    omitPinned
                    firstGroupTools={
                      liftedPins.length === 0 ? (
                        <>
                          {viewMenu}
                          {newChatAction}
                        </>
                      ) : undefined
                    }
                  />
                </section>
              </>
            )}
          </AnimatedList>
      </div>
    </div>
  );
}

function GroupHeading({
  label,
  open,
  onToggle,
  onCreate,
  createLabel,
  tools,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onCreate?: (() => void) | undefined;
  createLabel?: string | undefined;
  tools?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="group/section mt-3 first:mt-0 flex items-center gap-1 pl-3 pr-1.5 pt-1">
      <button
        type="button"
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-7 min-w-0 items-center gap-0.5 rounded py-1 text-left text-xs font-medium text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
      >
        <span className="truncate">{label}</span>
        <Icon
          name={open ? "ChevronDown" : "ChevronRight"}
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground/55 opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100 max-md:pointer-coarse:opacity-100"
        />
      </button>
      <span aria-hidden className="min-w-0 flex-1" />
      {tools}
      {children}
      {onCreate ? (
        <button
          type="button"
          aria-label={createLabel ?? `New ${label}`}
          title={createLabel ?? `New ${label}`}
          onClick={onCreate}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:size-9"
        >
          <Icon name="Plus" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function ProjectSection({
  section,
  ctx,
  sectionOpen,
  onToggleProject,
  onDeleteProject,
  onNewThread,
  icon,
  onSetIcon,
  canDragProject,
  isDragging,
  dropPlacement,
  onHeadingDragStart,
  status,
  statusLabel,
}: {
  section: ProjectSectionData;
  status?: ThreadStatusKind | null;
  statusLabel?: string | undefined;
  ctx: TreeContext;
  sectionOpen: boolean;
  onToggleProject: () => void;
  onDeleteProject?: (() => void) | undefined;
  onNewThread?: (() => void) | undefined;
  icon?: IconName | null;
  onSetIcon?: ((anchor: HTMLElement) => void) | undefined;
  canDragProject: boolean;
  isDragging: boolean;
  dropPlacement: DropPlacement | null;
  onHeadingDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  const [inactiveLimit, setInactiveLimit] = useState(DEFAULT_INACTIVE_CONVERSATIONS);
  const conversationPlan = useMemo(
    () =>
      planConversations(section, {
        activeThreadId: ctx.activeThreadId,
        limit: inactiveLimit,
      }),
    [ctx.activeThreadId, inactiveLimit, section],
  );
  const revealedConversations = conversationPlan.visible;
  // Collapsing a native project returns it to the first page, so reopening it
  // never silently dumps every historical conversation.
  useEffect(() => {
    if (!sectionOpen) setInactiveLimit(DEFAULT_INACTIVE_CONVERSATIONS);
  }, [sectionOpen]);
  // Minimal selected ancestor path, render-only: force-open collapsed
  // ancestors so the active row stays reachable without touching the stored
  // expansion preference.
  const selectedPathIds = useMemo(
    () => new Set(activePathIds(section, ctx.activeThreadId)),
    [section, ctx.activeThreadId],
  );

  const showMore =
    conversationPlan.hiddenConversations > 0 ? (
      <button
        type="button"
        aria-label={`Show ${Math.min(CONVERSATION_PAGE_SIZE, conversationPlan.hiddenConversations)} more conversations`}
        onClick={() => setInactiveLimit((current) => current + CONVERSATION_PAGE_SIZE)}
        className="ps-more-conversations flex min-h-8 w-full items-center rounded py-1 pl-6 pr-2 text-left text-2xs text-muted-foreground/40 transition-colors hover:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
      >
        <span className="truncate">{`Show more (${conversationPlan.hiddenConversations})`}</span>
      </button>
    ) : null;

  if (section.personal) {
    return (
      <section aria-label="Standalone chats" className="mb-1 mt-3 min-h-8 first:mt-0">
        <ShelfList
          section={section}
          shelf="active"
          ctx={ctx}
          grouped
          omitPinned
          keepIds={revealedConversations}
        />
        {showMore}
      </section>
    );
  }
  const displayState = glyphStateForStatus(status ?? "idle");
  // Collapsing a project whose conversation is selected keeps just that
  // selected path visible, without touching the stored expansion preference.
  const exceptionIds = selectedPathIds;
  const showCollapsedSelection = !sectionOpen && exceptionIds.size > 0;
  const activityLabel = statusLabel ?? ACTIVITY_LABELS[displayState];
  const disclosureLabel = sectionOpen
    ? `Collapse ${section.name}`
    : `Expand ${section.name}`;
  const isEmpty = conversationPlan.visible.size === 0;
  return (
    <section
      aria-label={section.name}
      data-dragging={isDragging ? "true" : undefined}
      className={cn(
        "mt-2 first:mt-0 transition-opacity duration-150 ease-out motion-reduce:transition-none",
        sectionOpen && "mb-1.5 [&+section]:mt-4",
        isDragging && "opacity-50",
      )}
    >
      <SidebarActions label={section.name} onHold={onToggleProject} actions={[
        { label: sectionOpen ? "Collapse children" : "Expand children", run: onToggleProject },
        ...(onNewThread ? [{ label: "New chat", run: onNewThread }] : []),
        ...(onSetIcon ? [{ label: "Set icon…", run: () => {
          const anchor = headingRef.current;
          if (anchor !== null) onSetIcon(anchor);
        } }] : []),
        ...(onDeleteProject ? [{ label: "Delete project", run: onDeleteProject, destructive: true, separatorBefore: true }] : []),
      ]}>
      <div
        ref={headingRef}
        data-reorder-id={canDragProject ? section.id : undefined}
        data-reorder-kind={canDragProject ? "project" : undefined}
        onPointerDown={canDragProject ? onHeadingDragStart : undefined}
        className={cn(
          "group/heading relative flex min-h-7 items-center gap-1.5 rounded-md py-1 pl-3 pr-1 max-md:pointer-coarse:min-h-11",
          sectionOpen && "mb-1",
        )}
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
        <span className="ps-status-slot relative flex w-4 shrink-0 items-center justify-center">
          <span className="ps-heading-lead flex pointer-events-none group-hover/heading:opacity-0 group-focus-within/heading:opacity-0 max-md:pointer-coarse:opacity-0">
            <ProjectStatusGlyph
              open={sectionOpen}
              icon={icon}
              label={activityLabel}
            />
          </span>
          <button
            type="button"
            aria-label={disclosureLabel}
            aria-expanded={sectionOpen}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (ctx.consumeSuppressedClick(section.id)) return;
              onToggleProject();
            }}
            className={cn(
              "ps-project-disclosure pointer-events-auto absolute inset-0 z-10 flex items-center justify-center rounded text-muted-foreground/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
              "opacity-0 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 focus-visible:opacity-100 max-md:pointer-coarse:opacity-100",
            )}
          >
            <Icon name={sectionOpen ? "ChevronDown" : "ChevronRight"} className="size-3.5 text-muted-foreground/55" />
          </button>
        </span>
        <button
          type="button"
          title={section.name}
          onClick={(event) => {
            if (ctx.consumeSuppressedClick(section.id)) return;
            if (event.detail <= 1) onToggleProject();
          }}
          className="flex min-h-5 min-w-0 shrink items-center rounded py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
        >
          <span className="ps-project-name min-w-0 truncate text-sm font-normal text-sidebar-foreground/85">
            {section.name}
            {section.known ? null : (
              <span className="text-muted-foreground/50"> (unknown)</span>
            )}
          </span>
        </button>
        <span aria-hidden className="min-w-0 flex-1" />
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
              "ps-project-new flex size-4 items-center justify-center rounded text-muted-foreground/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
              "max-md:pointer-coarse:size-9",
              "opacity-0 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 focus-visible:opacity-100 max-md:pointer-coarse:opacity-100",
            )}
          >
            <Icon name="MessageSquarePlus" className="size-3.5 max-md:pointer-coarse:size-5" />
          </button>
        ) : null}
      </div>

      </SidebarActions>

      {(() => {
        const interior = showCollapsedSelection ? (
          <ShelfList
            section={section}
            shelf="active"
            ctx={ctx}
            grouped
            omitPinned
            keepIds={exceptionIds}
            expandIds={exceptionIds}
          />
        ) : !sectionOpen ? null : isEmpty ? (
          <p className="px-3 py-1 text-xs text-muted-foreground/70">No threads</p>
        ) : (
          <>
            <ShelfList
              section={section}
              shelf="active"
              ctx={ctx}
              grouped
              omitPinned
              keepIds={revealedConversations}
            />
            {showMore}
          </>
        );
        if (interior === null) return interior;
        return <div className="ps-project-children">{interior}</div>;
      })()}

    </section>
  );
}
