import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  useRpc,
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
  homeKindOf,
  nativeProjectSectionId,
  NATIVE_PROJECT_PREFIX,
  projectThreadView,
  STANDALONE,
} from "./membership";
import {
  aggregateSectionStatus,
  summarizeSection,
  worstThreadStatus,
  THREAD_STATUS_RANK,
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
import type { cursorSidebarRpcContract } from "./server";
import { SidebarViewMenuRoot, SidebarViewMenuTrigger, SidebarViewSyncNotice } from "./SidebarViewMenu";
import {
  environmentFilterOptions,
  familyAwareComparator,
  filterOrdinaryThreads,
  homeDisplayParentOf,
  ordinaryCollapsibleTargets,
  ordinaryFamilyFacts,
  ordinaryFamilyGroupKeys,
  ordinaryThreadStatus,
  environmentGroupOf,
  NO_ENVIRONMENT_KEY,
  unreadOrdinaryThreadIds,
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
import { ageGroupKey, type AgeGroup } from "./age-groups";
import { ProjectStatusGlyph, ACTIVITY_LABELS, glyphStateForStatus } from "./ProjectStatusGlyph";
import { AnimatedList } from "./AnimatedList";
import { Drawer } from "./Drawer";
import { useShortcutGuide } from "./useShortcutGuide";
import { ICON_BTN } from "./icon-btn";
import { ShowMoreButton } from "./ShowMoreButton";


/**
 * How long a collapsed project holds the selected-path exception list after the
 * selection clears, so auto-animate can play the row's removal instead of the
 * list unmounting it instantaneously.
 */
const COLLAPSED_ROW_EXIT_MS = 220;

/**
 * Project-grouped thread list. BB's projects are the only containers, the
 * native personal container is shown as Threads, and settled threads sit in
 * one collapsed section under the thread list rather than a shelf per project.
 */
export function CursorSidebar({ activeThreadId, onNavigate }: PluginThreadListProps) {
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
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
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

  // The list fades its bottom edge while rows remain below the fold, so the
  // last visible row dissolves instead of meeting the next section with a cut.
  const listRef = useRef<HTMLDivElement | null>(null);
  const [listHasMore, setListHasMore] = useState(false);
  useEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    const update = () => {
      setListHasMore(list.scrollHeight - list.scrollTop - list.clientHeight > 4);
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(list);
    const content = new MutationObserver(update);
    content.observe(list, { childList: true, subtree: true, characterData: true });
    return () => {
      list.removeEventListener("scroll", update);
      resize.disconnect();
      content.disconnect();
    };
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

  const expandedProjects = usePersistentIds("bb-plugin-cursor-sidebar:expanded-projects:v1");
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
  const topGroupCollapsed = usePersistentIds("bb-plugin-cursor-sidebar:collapsed-top-groups:v1");
  const expandedThreads = usePersistentIds(EXPANDED_THREADS_KEY);
  const folderStore = useThreadSections();
  const knownFolderIds = useMemo(
    () => new Set(folderStore.sections.map((folder) => folder.id)),
    [folderStore.sections],
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
  // Held here rather than inside the menu so a grouping change, which moves the
  // trigger to another heading, leaves the open menu open.
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const shortcutKeys = useShortcutGuide();
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
  // Nesting writes the native parent link; the drag commit reads it at drop time.
  const setThreadParentRef = useRef<(threadId: string, parentThreadId: string) => void>(() => {});
  const setThreadParent = useCallback(
    (threadId: string, parentThreadId: string) => {
      void (async () => {
        try {
          await rpc.call("setThreadParent", { threadId, parentThreadId });
        } catch (cause) {
          toast.error("Could not nest that chat", {
            description: cause instanceof Error ? cause.message : String(cause),
          });
        }
      })();
    },
    [rpc],
  );
  setThreadParentRef.current = setThreadParent;

  const canPin = useCallback((threadId: string) => {
    const projected = projectedById.get(threadId);
    if (!projected) return false;
    return pinAllowed(projected.isArchived);
  }, [projectedById]);

  // Commit a released drag into the persistent stores.
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const onDragCommit = useCallback(
    (committed: ReorderDragState) => {
      // Nesting writes a native parent link, not an order, so it applies even
      // under an automatic conversation order.
      if (committed.kind === "thread" && committed.parentTargetId !== null) {
        setThreadParentRef.current(committed.movingId, committed.parentTargetId);
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
      // Conversations always take the selected automatic order, so a thread
      // drag never writes a sibling order.
    },
    [],
  );
  // A nest target must sit in the same project (so the tree can show it) and
  // never inside the dragged thread's own subtree.
  const canNest = useCallback(
    (targetId: string, movingId: string) => {
      if (targetId === movingId) return false;
      const moving = rawById.get(movingId);
      const target = rawById.get(targetId);
      if (moving === undefined || target === undefined) return false;
      if (moving.projectId !== target.projectId) return false;
      const descendants = descendantsById.get(movingId);
      return descendants === undefined || !descendants.some((thread) => thread.id === targetId);
    },
    [descendantsById, rawById],
  );
  const drag = useReorderDrag(onDragCommit, canNest);

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
  // One persisted SidebarView drives grouping, ordering, Show and the ordinary
  // filters. It never touches homes, folders, pin flags or manual order: it only
  // decides which ordinary rows render, how they are ordered and grouped, and
  // which supported metadata a row shows.
  const sidebarView = useSidebarView();
  const view = sidebarView.view;
  const familyRootOfId = useCallback(
    (threadId: string) =>
      familyRootId((id) => rawById.get(id)?.parentThreadId ?? null, threadId),
    [rawById],
  );
  // A pinned family and the open chat's family stay visible when an ordinary
  // filter would hide them.
  const pinnedFamilyRoots = useMemo(() => {
    const roots = new Set<string>();
    for (const thread of visible) {
      if (thread.isPinned) roots.add(familyRootOfId(thread.id));
    }
    return roots;
  }, [familyRootOfId, visible]);
  // Each project's aggregate status, read from the same visible feed the project
  // glyphs use, so a status ordering never disagrees with the heading. A family
  // lifted into the Pinned block belongs there, not to its home, so it is
  // skipped here exactly as the heading aggregate skips it.
  const projectStatusById = useMemo(() => {
    const members = new Map<string, PluginSidebarThread[]>();
    for (const thread of visible) {
      if (pinnedFamilyRoots.has(familyRootOfId(thread.id))) continue;
      const group = members.get(thread.projectId);
      if (group === undefined) members.set(thread.projectId, [thread]);
      else group.push(thread);
    }
    const status = new Map<string, ThreadStatusKind>();
    for (const [projectId, group] of members) {
      status.set(projectId, aggregateSectionStatus(group).status);
    }
    return status;
  }, [familyRootOfId, pinnedFamilyRoots, visible]);
  const orderedProjects = useMemo(() => {
    const byStored = orderByStoredIds(projects, liveProjectIds);
    if (view.sortProjectsBy !== "status") return byStored;
    const rank = (project: { id: string }): number =>
      THREAD_STATUS_RANK[projectStatusById.get(project.id) ?? "idle"];
    return [...byStored].sort(
      (left, right) =>
        rank(left) - rank(right) ||
        Number(left.isPersonal) - Number(right.isPersonal) ||
        left.name.localeCompare(right.name),
    );
  }, [liveProjectIds, projectStatusById, projects, view.sortProjectsBy]);
  const displayProjects = useMemo(
    () =>
      orderedProjects.map((project) => ({
        id: project.id,
        name: project.isPersonal ? "Chats" : project.name,
        isPersonal: project.isPersonal,
      })),
    [orderedProjects],
  );
  const activeFamilyRoot = useMemo(
    () => (activeThreadId === null ? null : familyRootOfId(activeThreadId)),
    [activeThreadId, familyRootOfId],
  );
  const projectsGrouping = view.groupBy === "workspace";
  const viewVisible = useMemo(
    () =>
      filterOrdinaryThreads(visible, view, {
        bypass: (thread) => {
          const root = familyRootOfId(thread.id);
          return pinnedFamilyRoots.has(root) || root === activeFamilyRoot;
        },
      }),
    [activeFamilyRoot, familyRootOfId, pinnedFamilyRoots, visible, view],
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
  // Automatic ordering reads the same family facts the grouping shows, so a
  // family sorts by the activity its divider shows. Facts come from the complete
  // visible set with same-home display parents, before any fold or preview.
  const siblingOrdering = useMemo<SiblingOrdering>(() => {
    const facts = ordinaryFamilyFacts(viewVisible, {
      parentOf: homeDisplayParentOf(viewVisible),
      statusOf: ordinaryThreadStatus,
    });
    return { compare: familyAwareComparator(view.sortConversationsBy, facts) };
  }, [view.sortConversationsBy, viewVisible]);
  // Conversations always take the selected automatic order; only projects and
  // folders keep a manual arrangement.
  const orderingFor = useCallback(
    (): SiblingOrdering => siblingOrdering,
    [siblingOrdering],
  );

  const sections = useMemo<ProjectSectionData[]>(
    () =>
      buildSections(
        viewVisible,
        displayProjects,
        () => "active",
        orderingFor,
      ),
    [displayProjects, orderingFor, viewVisible],
  );
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
    if (pinned) {
      const writes = planPinWrites({
        rootId: root,
        familyIds: ids,
        pinnedMemberIds: [],
        pinned: true,
      });
      for (const write of writes) await actions.setPinned(write.threadId, write.pinned);
      return { failed: [] };
    }
    const writes = planPinWrites({
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

  // The ids a thread drag carries, from a pooled row to its native home's
  // scope. Reorder stays inside one visible automatic group, so a drag never
  // crosses groups, files, pins or duplicates a family.
  const threadDragPlan = useCallback(
    (
      section: ProjectSectionData,
      thread: PluginSidebarThread,
      shelf: ThreadShelf,
    ): { commitSection: ProjectSectionData; scope: string; ids: string[] } => {
      const homeSection = sectionsById.get(sectionByThreadId.get(thread.id) ?? "") ?? section;
      const commitSection = section.id === pooledSectionRef.current.id ? homeSection : section;
      const scope = scopeOf(commitSection, thread.id);
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
      return { commitSection, scope, ids };
    },
    [expandedParents, knownFolderIds, now, projectsGrouping, sectionByThreadId, sectionsById, view],
  );

  const onThreadDragStart = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      section: ProjectSectionData,
      thread: PluginSidebarThread,
      shelf: ThreadShelf,
    ) => {
      const { commitSection, scope, ids } = threadDragPlan(section, thread, shelf);
      drag.startThread(event, commitSection.id, scope, ids, thread.id, threadDisplayTitle(thread));
    },
    [drag, threadDragPlan],
  );

  // The touch long-press pick-up, same payload, engaged at once.
  const onThreadDragPickUp = useCallback(
    (
      pointerId: number,
      clientX: number,
      clientY: number,
      section: ProjectSectionData,
      thread: PluginSidebarThread,
      shelf: ThreadShelf,
    ) => {
      const { commitSection, scope, ids } = threadDragPlan(section, thread, shelf);
      drag.startThreadPickUp(pointerId, clientX, clientY, commitSection.id, scope, ids, thread.id, threadDisplayTitle(thread));
    },
    [drag, threadDragPlan],
  );

  // Touch long-press pick-up for a project heading, over the same overlay order
  // the mouse drag writes.
  const onProjectDragPickUp = useCallback(
    (pointerId: number, clientX: number, clientY: number, sectionId: string) => {
      const name = displayProjects.find((project) => project.id === sectionId)?.name ?? "";
      drag.startProjectPickUp(pointerId, clientX, clientY, reorderableProjectIds, sectionId, name);
    },
    [displayProjects, drag, reorderableProjectIds],
  );

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

  const moveProjectWithinNative = useCallback(
    (projectId: string, offset: -1 | 1) => {
      // A status ordering owns the project list, so only the manual order moves.
      if (view.sortProjectsBy !== "manual") return false;
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
        parentTargetId: null,
      });
      setAnnouncement(
        `Moved project ${
          displayProjects.find((project) => project.id === projectId)?.name ?? projectId
        } to position ${next.indexOf(projectId) + 1} of ${next.length}`,
      );
      return true;
    },
    [displayProjects, onDragCommit, reorderableProjectIds, view.sortProjectsBy],
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
    },
    [moveProjectWithinNative],
  );

  const ctx = useMemo<TreeContext>(
    () => ({
      rawById,
      workspacePaths,
      primaryHostId,
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
      onThreadDragStart,
      onThreadDragPickUp,
      onProjectDragPickUp,
      canDragThreads: true,
      consumeSuppressedClick: drag.consumeSuppressedClick,
      draggingThreadId: drag.state?.kind === "thread" ? drag.state.movingId : null,
      dropTarget:
        drag.state?.kind === "thread" && drag.state.overId !== null
          ? { id: drag.state.overId, placement: drag.state.placement ?? "after" }
          : null,
      threadSections: folderStore.sections,
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
      childDropTarget: drag.state?.kind === "thread" ? drag.state.parentTargetId : null,
      shortcutKeys,
    }),
    [
      rawById, workspacePaths, primaryHostId,
      shortcutKeys,
      activeThreadId,
      canPin,
      collapsedGroups,
      togglePin,
      expandedAges,
      descendantsById,
      drag.consumeSuppressedClick,
      drag.state,
      expandedParents,
      folderStore.sections,
      now,
      onNavigate,
      onNewThread,
      onThreadDragStart,
      onThreadDragPickUp,
      onProjectDragPickUp,
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
        <p role="status" className="text-center text-xs text-sidebar-foreground/73">
          Loading threads…
        </p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-6">
        <p role="status" className="text-center text-xs text-sidebar-foreground/73">
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
    <SidebarViewMenuTrigger
      sync={sidebarView.sync}
      triggerClassName={`${ICON_BTN} data-[state=open]:text-sidebar-foreground/90`}
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
    // Pinned rows are lifted into the global Pinned block, so their activity
    // must not also light the home they came from: a working pinned thread
    // would otherwise put a spinner on a closed project that is already
    // showing it. The same lifted set drives the status ordering above.
    const sectionThreads = projectedThreads.filter(
      (thread) =>
        thread.projectId === section.id &&
        !pinnedFamilyRoots.has(familyRootOfId(thread.id)),
    );
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
        canDragProject={kind === "project" && section.known && view.sortProjectsBy === "manual"}
        isDragging={drag.state?.kind === "project" && drag.state.movingId === section.id}
        dropPlacement={
          drag.state?.kind === "project" && drag.state.overId === section.id
            ? drag.state.placement
            : null
        }
        onHeadingDragStart={(event) => {
          drag.startProject(event, reorderableProjectIds, section.id, section.name);
        }}
      />
    );
  };

  return (
    <SidebarViewMenuRoot
      open={viewMenuOpen}
      onOpenChange={setViewMenuOpen}
      view={view}
      sync={sidebarView.sync}
      onRetry={sidebarView.retry}
      onUpdate={sidebarView.update}
      environmentOptions={viewEnvironmentOptions}
      showNoEnvironment={hasEnvironmentlessOrdinary}
      anyCollapsed={anyCollapsed}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      unreadOrdinaryCount={unreadOrdinary.length}
      markReadBusy={markReadBusy}
      onMarkAllRead={() => { void markAllRead(); }}
    >
    <div data-cursor-sidebar-root="" className="flex min-h-0 flex-1 flex-col">
      <SidebarViewSyncNotice sync={sidebarView.sync} onRetry={sidebarView.retry} />

      <div
        ref={listRef}
        data-fade-more={listHasMore ? "true" : undefined}
        onKeyDown={handleListKeyDown}
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
          <AnimatedList
            as="div"
            key={view.groupBy}
            className="cs-grouping-swap"
          >
            {liftedPins.length > 0 ? (
              <>
                <GroupHeading
                  label="Pinned"
                  open={!topGroupCollapsed.ids.has("pinned")}
                  onToggle={() => topGroupCollapsed.toggle("pinned")}
                />
                <Drawer open={!topGroupCollapsed.ids.has("pinned")}>
                  <PinnedList items={liftedPins} ctx={ctx} />
                </Drawer>
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
                  tools={viewMenu}
                />
                <Drawer open={!topGroupCollapsed.ids.has("projects")}>
                  {nativeSectionsVisible.map((section) => renderSection(section))}
                  <GroupHeading
                    label="Threads"
                    open={expandedThreads.ids.has("threads")}
                    onToggle={() => expandedThreads.toggle("threads")}
                  />
                  <Drawer open={expandedThreads.ids.has("threads")}>
                    {chatSectionsVisible.map((section) => renderSection(section))}
                  </Drawer>
                </Drawer>
              </>
            ) : (
              <>
                <section aria-label="Threads" className="mb-1 mt-3 min-h-8 first:mt-0">
                  <ShelfList
                    section={pooledSection}
                    shelf="active"
                    ctx={ctx}
                    grouped
                    firstGroupTools={
                      <>
                        {viewMenu}
                        {newChatAction}
                      </>
                    }
                  />
                </section>
              </>
            )}
          </AnimatedList>
      </div>
    </div>
    </SidebarViewMenuRoot>
  );
}

function GroupHeading({
  label,
  open,
  onToggle,
  onCreate,
  createLabel,
  tools,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onCreate?: (() => void) | undefined;
  createLabel?: string | undefined;
  tools?: ReactNode;
}) {
  return (
    <div className="cs-heading group/section mt-3 first:mt-0 flex items-center gap-1 pl-3 pr-2 max-md:pointer-coarse:pr-0.5">
      <button
        type="button"
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-7 min-w-0 items-center gap-0.5 rounded py-1 text-left text-xs font-medium text-sidebar-foreground/73 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9"
      >
        <span className="truncate">{label}</span>
        <Icon
          name="ChevronRight"
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-sidebar-foreground/73 opacity-0 transition-transform duration-150 ease-out motion-reduce:transition-none group-hover/section:opacity-100 group-focus-within/section:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100",
            open && "rotate-90",
          )}
        />
      </button>
      <span aria-hidden className="min-w-0 flex-1" />
      {tools}
      {onCreate ? (
        <button
          type="button"
          aria-label={createLabel ?? `New ${label}`}
          title={createLabel ?? `New ${label}`}
          onClick={onCreate}
          className={`ml-3 ${ICON_BTN} max-md:pointer-coarse:ml-0`}
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
  // Collapsing a project whose conversation is selected keeps just that
  // selected path visible, without touching the stored expansion preference.
  const exceptionIds = selectedPathIds;
  const showCollapsedSelection = !sectionOpen && exceptionIds.size > 0;
  // Hold the exception list mounted briefly after the selection clears so the
  // row's removal is a childList mutation the list's auto-animate can play,
  // rather than the whole list unmounting the row instantly.
  const [keepException, setKeepException] = useState(false);
  useEffect(() => {
    if (showCollapsedSelection) {
      setKeepException(true);
      return;
    }
    if (!keepException) return;
    const timeout = window.setTimeout(() => setKeepException(false), COLLAPSED_ROW_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [keepException, showCollapsedSelection]);

  const showMore = (
    <ShowMoreButton
      hiddenConversations={conversationPlan.hiddenConversations}
      onShowMore={() => setInactiveLimit((current) => current + CONVERSATION_PAGE_SIZE)}
    />
  );

  if (section.personal) {
    return (
      <section aria-label="Standalone chats" className="mb-1 mt-1 min-h-8 first:mt-0">
        <ShelfList
          section={section}
          shelf="active"
          ctx={ctx}
          grouped
          keepIds={revealedConversations}
        />
        {showMore}
      </section>
    );
  }
  const displayState = glyphStateForStatus(status ?? "idle");
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
      <SidebarActions
        label={section.name}
        onHold={onToggleProject}
        onReorderStart={
          canDragProject
            ? (pointerId, clientX, clientY) => {
                ctx.onProjectDragPickUp(pointerId, clientX, clientY, section.id);
                return true;
              }
            : undefined
        }
        actions={[
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
          "cs-project-heading group/heading relative flex min-h-7 items-center gap-1.5 rounded-md py-1 pl-3 pr-1 max-md:min-h-11 pointer-coarse:min-h-11",
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
        <span className="cs-status-slot relative flex w-4 shrink-0 items-center justify-center">
          <span className="flex pointer-events-none group-hover/heading:opacity-0 group-focus-within/heading:opacity-0">
            <ProjectStatusGlyph
              open={sectionOpen}
              icon={icon}
              label={activityLabel}
              status={status ?? "idle"}
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
              "cs-project-disclosure pointer-events-auto absolute inset-0 z-10 flex items-center justify-center rounded text-sidebar-foreground/73 hover:text-sidebar-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
              "opacity-0 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 focus-visible:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100",
            )}
          >
            <Icon
              name="ChevronRight"
              className={cn(
                "size-3.5 text-sidebar-foreground/73 transition-transform duration-150 ease-out motion-reduce:transition-none",
                sectionOpen && "rotate-90",
              )}
            />
          </button>
        </span>
        <button
          type="button"
          title={section.name}
          onClick={(event) => {
            if (ctx.consumeSuppressedClick(section.id)) return;
            if (event.detail <= 1) onToggleProject();
          }}
          className="flex min-h-5 min-w-0 shrink items-center rounded py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9"
        >
          <span className="cs-project-name min-w-0 truncate text-sm font-normal text-sidebar-foreground/95">
            {section.name}
            {section.known ? null : (
              <span className="text-sidebar-foreground/73"> (unknown)</span>
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
              "cs-project-new flex size-4 items-center justify-center rounded-md text-sidebar-foreground/73 hover:text-sidebar-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
              "max-md:size-9 pointer-coarse:size-9",
              "opacity-0 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 focus-visible:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100",
            )}
          >
            <Icon name="MessageSquarePlus" className="size-3.5 max-md:size-5 pointer-coarse:size-5" />
          </button>
        ) : null}
      </div>

      </SidebarActions>

      {showCollapsedSelection || (!sectionOpen && keepException) ? (
        /* The collapsed exception list stays mounted through the exit window
           so its own list animation can play the selected row out. Its keepIds
           go empty as soon as the selection clears; the row is a removed
           child, not an unmounted subtree. */
        <div>
          <ShelfList
            section={section}
            shelf="active"
            ctx={ctx}
            grouped
            keepIds={exceptionIds}
            expandIds={exceptionIds}
          />
        </div>
      ) : (
        /* A Drawer rather than an early return, so collapsing the heading
           shrinks the interior instead of unmounting it in one frame. */
        <Drawer open={sectionOpen}>
          {isEmpty ? (
            <p className="px-3 py-1 text-xs text-sidebar-foreground/73">No threads</p>
          ) : (
            <>
              <ShelfList
                section={section}
                shelf="active"
                ctx={ctx}
                grouped
                keepIds={revealedConversations}
              />
              {showMore}
            </>
          )}
        </Drawer>
      )}

    </section>
  );
}
