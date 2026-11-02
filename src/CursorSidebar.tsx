import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toast } from "sonner";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  useRpc,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { SidebarActions } from "./SidebarActions";
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
import { planConversations } from "./conversations";
import { useWorkspaces } from "./useWorkspaces";
import { useWorkspaceNesting } from "./workspace-tabs";
import { usePrimaryHost } from "./usePrimaryHost";
import { useProjectIcons } from "./useProjectIcons";
import { ProjectIconPicker } from "./ProjectIconPicker";
import type { ProjectIcon } from "./project-icons";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { useThreadOrders } from "./useThreadOrders";
import { useReorderDrag, type ReorderDragState } from "./useReorderDrag";
import {
  mergeVisibleOrder,
  moveIdByOffset,
  orderByStoredIds,
} from "./thread-order";
import {
  COLLAPSED_AGES_KEY,
  COLLAPSED_GROUPS_KEY,
  COLLAPSED_SECTIONS_KEY,
  usePersistentIds,
} from "./collapse";
import { useThreadSections } from "./useThreadSections";
import { useThreadMutations } from "./thread-actions";
import { useSidebarView } from "./useSidebarView";
import type { cursorSidebarRpcContract } from "./server";
import { SidebarViewMenuRoot, SidebarViewMenuTrigger, SidebarViewSyncNotice } from "./SidebarViewMenu";
import { ProjectSwitcher } from "./ProjectSwitcher";
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
  viewHasActiveFilters,
  NO_ENVIRONMENT_KEY,
  projectFilterOptions,
  projectKeyOf,
  threadsPerGroupPage,
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
import {
  SectionHeading,
  SECTION_HEADING_LABEL,
  SECTION_HEADING_ROW,
} from "./SectionDivider";
import { openHostAddProject } from "./open-host-add-project";
import { ShowMoreButton } from "./ShowMoreButton";


/**
 * How long a collapsed project holds the selected-path exception list after the
 * selection clears, so auto-animate can play the row's removal instead of the
 * list unmounting it instantaneously.
 */
const COLLAPSED_ROW_EXIT_MS = 220;

/**
 * Project-grouped thread list. BB's projects are the only containers, the
 * native personal container is shown as Chats, and settled threads sit in one
 * collapsed section under the thread list rather than a shelf per project.
 */
export function CursorSidebar({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const { status, threads: rawThreads, projects: nativeProjects } = useSidebarThreads();
  const nativeProjectSections = useMemo(
    () => nativeProjects.filter((project) => !project.isPersonal).map((project) => ({ id: nativeProjectSectionId(project.id), name: project.name, isPersonal: false })),
    [nativeProjects],
  );
  const projects = useMemo(
    () => [...nativeProjectSections, { id: STANDALONE, name: "Threads", isPersonal: true }],
    [nativeProjectSections],
  );
  const nativeProjectedThreads = useMemo(() => projectThreadView(rawThreads, nativeProjects), [rawThreads, nativeProjects]);
  const { threads: projectedThreads, names: workspaceNames } = useWorkspaceNesting(nativeProjectedThreads, rawThreads);
  const threads = useMemo(
    () =>
      resolveThreadDisplayTitles(projectedThreads).map((thread) => {
        const name = workspaceNames.get(thread.id);
        return name ? { ...thread, displayTitle: name } : thread;
      }),
    [projectedThreads, workspaceNames],
  );
  const projectedById = useMemo(() => new Map(projectedThreads.map((thread) => [thread.id, thread])), [projectedThreads]);
  const workspacePaths = useWorkspaces(rawThreads);
  const primaryHostId = usePrimaryHost();
  const rawById = useMemo(() => new Map(rawThreads.map((thread) => [thread.id, thread])), [rawThreads]);
  const threadOrders = useThreadOrders();
  const threadOrdersRef = useRef(threadOrders);
  threadOrdersRef.current = threadOrders;
  const actions = useThreadMutations();
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
  /** Native project id to display name, for the row project icon's tooltip. */
  const projectLabelById = useMemo(
    () =>
      new Map(
        nativeProjects.map((project) => [
          project.id,
          project.isPersonal ? "Chats" : project.name,
        ]),
      ),
    [nativeProjects],
  );
  const onNewThread = useCallback(() => {
    actions.openNewThread({
      ...(personalProjectId === null ? {} : { projectId: personalProjectId }),
      focusPrompt: true,
    });
    onNavigate();
  }, [actions, onNavigate, personalProjectId]);

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

  // Every dated bucket defaults open; this set holds only the explicitly folded
  // ones. The previous open-allow-list made any populated bucket other than
  // Today/Yesterday render as a heading with nothing under it.
  const collapsedAges = usePersistentIds(COLLAPSED_AGES_KEY);
  const collapsedGroups = usePersistentIds(COLLAPSED_GROUPS_KEY);
  // Top-level group headings (Pinned, projects, Chats) default open; these sets
  // hold the folded ones and are device preferences, not shared state.
  const topGroupCollapsed = usePersistentIds("bb-plugin-cursor-sidebar:collapsed-top-groups:v1");
  const collapsedSections = usePersistentIds(COLLAPSED_SECTIONS_KEY);
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
  const [iconPicker, setIconPicker] = useState<{ projectId: string; name: string; anchor: HTMLElement | null } | null>(null);
  const iconPickerFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (iconPickerFrame.current !== null) cancelAnimationFrame(iconPickerFrame.current);
    },
    [],
  );
  // One dialog for every entry point: a heading, a thread row or the switcher.
  // The open is deferred a frame so the menu that asked for it has finished
  // closing (and restoring focus) before the dialog claims focus for itself.
  const openIconPicker = useCallback(
    (projectId: string, anchor?: HTMLElement | null) => {
      if (iconPickerFrame.current !== null) cancelAnimationFrame(iconPickerFrame.current);
      const explicit = anchor ?? null;
      iconPickerFrame.current = requestAnimationFrame(() => {
        iconPickerFrame.current = null;
        const restore =
          explicit ??
          (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        setIconPicker({
          projectId,
          name: projectLabelById.get(projectId) ?? "",
          anchor: restore,
        });
      });
    },
    [projectLabelById],
  );

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
  // One set of family aggregates for the complete loaded set, reused by the
  // age filter, the Updated headings, the Status groups and the conversation
  // order. Filtering out a descendant can never move its family elsewhere.
  const familyFacts = useMemo(
    () =>
      ordinaryFamilyFacts(visible, {
        parentOf: homeDisplayParentOf(visible),
        statusOf: ordinaryThreadStatus,
      }),
    [visible],
  );

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
  // A project drag holds the list still and commits on release, so there is no
  // in-flight order to weave into the visible one here.
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
  // One fact per project for the status ordering, from the same visible feed
  // the project glyphs use: the worst status among its chats, and when the
  // project last had any activity. A family lifted into the Pinned block
  // belongs there, not to its home, so it is skipped here exactly as the
  // heading aggregate skips it, and an archived chat raises neither fact.
  const projectOrderById = useMemo(() => {
    const members = new Map<string, PluginSidebarThread[]>();
    for (const thread of visible) {
      if (pinnedFamilyRoots.has(familyRootOfId(thread.id))) continue;
      const group = members.get(thread.projectId);
      if (group === undefined) members.set(thread.projectId, [thread]);
      else group.push(thread);
    }
    const facts = new Map<string, { status: ThreadStatusKind; lastActiveAt: number }>();
    for (const [projectId, group] of members) {
      let lastActiveAt = 0;
      for (const thread of group) {
        if (thread.isArchived) continue;
        lastActiveAt = Math.max(lastActiveAt, thread.updatedAt);
      }
      facts.set(projectId, { status: aggregateSectionStatus(group).status, lastActiveAt });
    }
    return facts;
  }, [familyRootOfId, pinnedFamilyRoots, visible]);
  // Worst status first, then the project used most recently. Status alone
  // leaves every finished project to its alphabetical slot, so the one that
  // just ran a chat falls back down the list the moment it stops working.
  const orderedProjects = useMemo(() => {
    const byStored = orderByStoredIds(projects, baseProjectIds);
    if (view.sortProjectsBy !== "status") return byStored;
    const factOf = (project: { id: string }) => projectOrderById.get(project.id);
    const statusRank = (project: { id: string }): number =>
      THREAD_STATUS_RANK[factOf(project)?.status ?? "idle"];
    const lastActive = (project: { id: string }): number => factOf(project)?.lastActiveAt ?? 0;
    return [...byStored].sort(
      (left, right) =>
        statusRank(left) - statusRank(right) ||
        lastActive(right) - lastActive(left) ||
        Number(left.isPersonal) - Number(right.isPersonal) ||
        left.name.localeCompare(right.name),
    );
  }, [baseProjectIds, projectOrderById, projects, view.sortProjectsBy]);
  const displayProjects = useMemo(
    () =>
      orderedProjects.map((project) => ({
        id: project.id,
        name: project.isPersonal ? "Threads" : project.name,
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
        now,
        familyFacts,
        bypass: (thread) => {
          const root = familyRootOfId(thread.id);
          return pinnedFamilyRoots.has(root) || root === activeFamilyRoot;
        },
      }),
    [activeFamilyRoot, familyFacts, familyRootOfId, now, pinnedFamilyRoots, visible, view],
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
  const viewProjectOptions = useMemo(
    () => projectFilterOptions(visible, nativeProjects, view.projectFilter),
    [nativeProjects, visible, view.projectFilter],
  );
  const unreadOrdinary = useMemo(
    () => unreadOrdinaryThreadIds(visible),
    [visible],
  );
  // Automatic ordering reads the same family facts the grouping shows, so a
  // family sorts by the activity its divider shows. Facts come from the complete
  // visible set with same-home display parents, before any filter, fold or
  // preview.
  const siblingOrdering = useMemo<SiblingOrdering>(
    () => ({
      compare: familyAwareComparator(view.sortConversationsBy, familyFacts),
    }),
    [familyFacts, view.sortConversationsBy],
  );
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
  // A project filter hides its whole group in Projects grouping, header
  // included. The sections still feed the Pinned block, so a pinned family from
  // a filtered-out project is lifted and stays visible; only its group goes.
  const projectSectionsVisible = useMemo(() => {
    const projectFilter = view.projectFilter;
    if (projectFilter === null) return sections;
    return sections.filter((section) => {
      const nativeId =
        section.members.length > 0
          ? projectKeyOf(section.members[0]!)
          : section.id.startsWith(NATIVE_PROJECT_PREFIX)
            ? section.id.slice(NATIVE_PROJECT_PREFIX.length)
            : personalProjectId;
      if (nativeId === null) return true;
      return projectFilter.includes(nativeId);
    });
  }, [personalProjectId, sections, view.projectFilter]);
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
            familyFacts,
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
    [expandedParents, familyFacts, knownFolderIds, now, projectsGrouping, sectionByThreadId, sectionsById, view],
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
        familyFacts,
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
  }, [activeThreadId, familyFacts, now, projectsGrouping, sectionByThreadId, sectionsById, view]);

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
    // A hidden/filtered thread reveals the heading that contains it, so the row
    // is found where it belongs rather than being duplicated. A folded project
    // is never opened by selection: it shows the selected exception row and
    // keeps its stored expansion.
    // Never permanently open a collapsed project on selection; per-conversation
    // ancestor folding below is transient view state, not a stored preference.
    if (reveal.updatedAgeKey) collapsedAges.remove(reveal.updatedAgeKey);
    if (reveal.collapsedGroupKey) collapsedGroups.remove(reveal.collapsedGroupKey);
    setExpandedParents((current) => new Set([...current, ...reveal.ancestors]));
  }, [activeThreadId, reveal, collapsedAges, collapsedGroups]);

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
      familyFacts,
      descendantsById,
      activeThreadId,
      expandedParents,
      collapsedAgeGroups: collapsedAges.ids,
      onToggleAgeGroup: collapsedAges.toggle,
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
      // Under a project heading the row icon only repeats the heading, and a
      // switcher narrowed to one project has nothing left to distinguish.
      showProjectIcons:
        view.show.projectIcons &&
        !(view.projectFilter !== null && view.projectFilter.length === 1),
      projectIconFor: (projectId: string) => projectIcons.iconFor(projectId),
      projectLabelFor: (projectId: string) => projectLabelById.get(projectId) ?? null,
      personalProjectId,
      openIconPicker,
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
      collapsedAges,
      descendantsById,
      drag.consumeSuppressedClick,
      drag.state,
      expandedParents,
      familyFacts,
      folderStore.sections,
      now,
      onNavigate,
      onThreadDragStart,
      onThreadDragPickUp,
      onProjectDragPickUp,
      toggleChildren,
      visibleById,
      view,
      personalProjectId,
      projectIcons,
      projectLabelById,
      openIconPicker,
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
  const bulkTopGroupKeys = liftedPins.length > 0 ? ["pinned"] : [];
  const collapseSections = useMemo(
    () => (projectsGrouping ? projectSectionsVisible : [pooledSection]),
    [pooledSection, projectsGrouping, projectSectionsVisible],
  );
  const bulkSectionIds = useMemo(
    () =>
      // The flat None grouping draws no section heading, so a bulk toggle
      // there only folds child threads; it never writes a section key.
      view.groupBy === "none" ? [] : collapseSections.map((section) => section.id),
    [collapseSections, view.groupBy],
  );  const bulkTargets = useMemo(
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
          familyFacts,
        },
      ),
    [collapseSections, familyFacts, knownFolderIds, now, view],
  );
  const expandAll = useCallback(() => {
    topGroupCollapsed.removeMany(bulkTopGroupKeys);
    collapsedSections.removeMany(bulkSectionIds);
    collapsedGroups.removeMany(bulkTargets.groupKeys);
    collapsedAges.removeMany(bulkTargets.ageKeys);
    setExpandedParents((current) => new Set([...current, ...bulkTargets.parentIds]));
  }, [bulkSectionIds, bulkTargets, bulkTopGroupKeys, collapsedAges, collapsedGroups, collapsedSections, topGroupCollapsed]);
  const collapseAll = useCallback(() => {
    topGroupCollapsed.addMany(bulkTopGroupKeys);
    collapsedSections.addMany(bulkSectionIds);
    collapsedGroups.addMany(bulkTargets.groupKeys);
    collapsedAges.addMany(bulkTargets.ageKeys);
    setExpandedParents((current) => {
      const next = new Set(current);
      for (const id of bulkTargets.parentIds) next.delete(id);
      return next;
    });
  }, [bulkSectionIds, bulkTargets, bulkTopGroupKeys, collapsedAges, collapsedGroups, collapsedSections, topGroupCollapsed]);

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

  // A project's heading only renders when something under it actually renders.
  // Pinned families are lifted into the Pinned block, so a project holding only
  // pins would otherwise draw an empty heading. The one exception is the
  // project picked in the switcher: it stays put and says "No threads".
  const nativeProjectIdOfSection = (section: ProjectSectionData): string | null =>
    section.members.length > 0
      ? projectKeyOf(section.members[0]!)
      : section.id.startsWith(NATIVE_PROJECT_PREFIX)
        ? section.id.slice(NATIVE_PROJECT_PREFIX.length)
        : section.personal
          ? personalProjectId
          : null;
  const selectedProjectId =
    view.projectFilter !== null && view.projectFilter.length === 1
      ? view.projectFilter[0]!
      : null;
  // An empty project picked in the switcher says "No threads" rather than
  // blaming the current filters for hiding every row.
  const selectedProjectEmpty =
    selectedProjectId !== null &&
    !visible.some((thread) => projectKeyOf(thread) === selectedProjectId);
  const sectionHasVisibleThreads = (section: ProjectSectionData): boolean =>
    section.byShelf.active.some(
      (thread) => !pinnedFamilyRoots.has(familyRootOfId(thread.id)),
    );
  const sectionShown = (section: ProjectSectionData): boolean =>
    sectionHasVisibleThreads(section) ||
    (selectedProjectId !== null && nativeProjectIdOfSection(section) === selectedProjectId);
  const nativeSectionsVisible = projectSectionsVisible.filter(
    (section) => !section.personal && sectionShown(section),
  );
  const chatSectionsVisible = projectSectionsVisible.filter(
    (section) => section.personal && sectionShown(section),
  );
  // One project's chats read as one flat list, Zeron's way: with a single
  // project selected under Projects grouping the lone home loses its header
  // (and so cannot be folded away), leaving just its threads under the
  // switcher.
  const singleProjectSection =
    projectsGrouping &&
    view.projectFilter !== null &&
    nativeSectionsVisible.length + chatSectionsVisible.length === 1
      ? nativeSectionsVisible[0] ?? chatSectionsVisible[0]!
      : null;

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
    bulkSectionIds.some((id) => collapsedSections.ids.has(id)) ||
    [...bulkTargets.groupKeys].some((key) => collapsedGroups.ids.has(key)) ||
    [...bulkTargets.ageKeys].some((key) => collapsedAges.ids.has(key)) ||
    [...bulkTargets.parentIds].some((id) => !expandedParents.has(id));

  const nothingToShow =
    liftedPins.length === 0 &&
    (projectsGrouping
      ? nativeSectionsVisible.length === 0 && chatSectionsVisible.length === 0
      : pooledSection.byShelf.active.length === 0);

  const viewMenu = (
    <SidebarViewMenuTrigger
      sync={sidebarView.sync}
      triggerClassName={`${ICON_BTN} data-[state=open]:text-sidebar-foreground/90`}
    />
  );

  const renderSection = (section: ProjectSectionData, flat = false) => {
    const kind = section.personal ? "chats" : homeKindOf(section.id);
    const sectionOpen = !collapsedSections.ids.has(section.id);
    const toggleSection = () => collapsedSections.toggle(section.id);
    // Pinned rows are lifted into the global Pinned block, so their activity
    // must not also light the home they came from: a working pinned thread
    // would otherwise put a spinner on a closed project that is already
    // showing it. The same lifted set drives the status ordering above.
    const sectionThreads = projectedThreads.filter(
      (thread) =>
        thread.projectId === section.id &&
        !pinnedFamilyRoots.has(familyRootOfId(thread.id)),
    );
    // A collapsed project keeps the selected path on screen, so that row is
    // already drawing its own activity; the heading speaks only for the rows
    // the fold actually hides, or a working selection spins twice.
    const onScreen = sectionOpen
      ? null
      : new Set(activePathIds(section, ctx.activeThreadId));
    const aggregate = summarizeSection(
      section.name,
      onScreen === null
        ? sectionThreads
        : sectionThreads.filter((thread) => !onScreen.has(thread.id)),
    );
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
        sectionOpen={sectionOpen}
        onToggleProject={toggleSection}
        icon={nativeId !== null ? projectIcons.iconFor(nativeId) : null}
        onSetIcon={
          kind === "project" && nativeId !== null
            ? (anchor) => openIconPicker(nativeId, anchor)
            : undefined
        }
        onDeleteProject={
          kind === "project" && nativeId !== null && section.known
            ? () => setDeletingProject({ id: nativeId, name: section.name, chats: sectionThreads.length })
            : undefined
        }
        canDragProject={kind === "project" && section.known && view.sortProjectsBy === "manual"}
        onMoveProject={
          kind === "project" && section.known && view.sortProjectsBy === "manual"
            ? (offset) => { moveProjectWithinNative(section.id, offset); }
            : undefined
        }
        isDragging={drag.state?.kind === "project" && drag.state.movingId === section.id}
        flat={flat}
        empty={!sectionHasVisibleThreads(section)}
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
      {/* One fixed toolbar above the scroll area: the project switcher on the
          left, the view menu on the right. No section heading carries controls. */}
      <div className="flex shrink-0 items-center gap-1 px-1.5 pt-2">
        <div className="flex min-w-0 flex-1 items-center">
          <ProjectSwitcher
            projects={viewProjectOptions}
            selected={view.projectFilter}
            iconFor={(projectId) => projectIcons.iconFor(projectId)}
            onSelect={(projectId) =>
              sidebarView.update({ projectFilter: projectId === null ? null : [projectId] })
            }
            onSetIcon={
              selectedProjectId !== null && selectedProjectId !== personalProjectId
                ? (anchor) => openIconPicker(selectedProjectId, anchor)
                : undefined
            }
            onNewProject={(trigger) => {
              if (!openHostAddProject(trigger)) toast.error("Couldn't open Add project.");
            }}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {viewMenu}
        </div>
      </div>

      <div
        ref={listRef}
        data-fade-more={listHasMore ? "true" : undefined}
        onKeyDown={handleListKeyDown}
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
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
            }}          />
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
              singleProjectSection !== null ? (
                // One project: no section header and no fold, so its threads
                // read as the single list under the switcher.
                renderSection(singleProjectSection, true)
              ) : (
                <>
                  {/* Project headings and the Chats heading are the sections;
                      no umbrella heading restates the grouping. A heading drag
                      moves these sections on its own transforms, so the list
                      holds its slides until the drop has landed. */}
                  <AnimatedList as="div" paused={drag.state?.kind === "project"}>
                    {nativeSectionsVisible.map((section) => renderSection(section))}
                  </AnimatedList>
                  {chatSectionsVisible.map((section) => renderSection(section))}
                </>
              )
            ) : (
              <section aria-label="Chats" className="mb-1 min-h-8">
                <ShelfList
                  section={pooledSection}
                  shelf="active"
                  ctx={ctx}
                  grouped
                />
              </section>
            )}
            {/* No heading is ever drawn empty; when nothing renders at all the
                list still says why, rather than going blank. */}
            {nothingToShow ? (
              <p className="px-3 py-2 text-xs text-sidebar-foreground/73">
                {selectedProjectEmpty
                  ? "No threads"
                  : viewHasActiveFilters(view)
                    ? "No threads match the current filters."
                    : "No threads"}
              </p>
            ) : null}
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
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <SectionHeading
      label={label}
      open={open}
      onToggle={onToggle}
      className="mt-3 first:mt-0"
    />
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
  onMoveProject,
  isDragging,
  onHeadingDragStart,
  status,
  statusLabel,
  flat = false,
  empty,
}: {
  section: ProjectSectionData;
  status?: ThreadStatusKind | null;
  statusLabel?: string | undefined;
  ctx: TreeContext;
  sectionOpen: boolean;
  onToggleProject: () => void;
  onDeleteProject?: (() => void) | undefined;
  onNewThread?: (() => void) | undefined;
  icon?: ProjectIcon | null;
  onSetIcon?: ((anchor: HTMLElement) => void) | undefined;
  canDragProject: boolean;
  /** Hand-order the project one place, the same write the drag commits. */
  onMoveProject?: ((offset: -1 | 1) => void) | undefined;
  isDragging: boolean;
  /**
   * Render the threads only: no heading, no disclosure, always open. The
   * single-project view uses this so its one home cannot be folded away.
   */
  flat?: boolean;
  /**
   * Nothing under this heading would render: no visible thread, and no family
   * lifted into Pinned either. The selected project keeps its heading and says
   * "No threads".
   */
  empty?: boolean;
  onHeadingDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  // The project previews one page of its inactive conversations. "All" is no
  // limit, so the reveal control never appears.
  const pageSize = threadsPerGroupPage(ctx.view.threadsPerGroup);
  const [inactiveLimit, setInactiveLimit] = useState(pageSize);
  const conversationPlan = useMemo(
    () =>
      planConversations(section, {
        activeThreadId: ctx.activeThreadId,
        limit: inactiveLimit,
      }),
    [ctx.activeThreadId, inactiveLimit, section],
  );
  const revealedConversations = conversationPlan.visible;
  // A new page size applies in the same render: resetting in an effect would
  // paint one frame of the old limit's extra rows first.
  const [lastPageSize, setLastPageSize] = useState(pageSize);
  if (lastPageSize !== pageSize) {
    setLastPageSize(pageSize);
    setInactiveLimit(pageSize);
  }
  // Collapsing a native project returns it to the first page, so reopening it
  // never silently dumps every historical conversation.
  useEffect(() => {
    if (!sectionOpen) setInactiveLimit(pageSize);
  }, [pageSize, sectionOpen]);
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
      pageSize={pageSize}
      onShowMore={() => setInactiveLimit((current) => current + pageSize)}
    />
  );

  const isEmpty = empty ?? conversationPlan.visible.size === 0;
  if (flat) {
    // No heading means nothing to fold, so the lone project's threads stay put
    // under the switcher however the stored expansion preference reads.
    return (
      <section aria-label={section.name} className="mb-1 mt-1 min-h-8 first:mt-0">
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
      </section>
    );
  }
  const displayState = glyphStateForStatus(status ?? "idle");
  const activityLabel = statusLabel ?? ACTIVITY_LABELS[displayState];
  const disclosureLabel = sectionOpen
    ? `Collapse ${section.name}`
    : `Expand ${section.name}`;
  return (
    <section
      aria-label={section.name}
      data-dragging={isDragging ? "true" : undefined}
      className={cn(
        "mt-2 first:mt-0",
        sectionOpen && "mb-1.5 [&+section]:mt-4",
      )}
    >
      <SidebarActions
        label={section.name}
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
        // A hold already owns the drag on touch, and a drag that has to beat
        // the list's own scrolling does not always win. Moving by hand is the
        // same write with no gesture to lose.
        ...(onMoveProject
          ? [
              { label: "Move up", run: () => onMoveProject(-1), separatorBefore: true },
              { label: "Move down", run: () => onMoveProject(1) },
            ]
          : []),
        ...(onDeleteProject ? [{ label: "Delete project", run: onDeleteProject, destructive: true, separatorBefore: true }] : []),
      ]}>
      <div
        ref={headingRef}
        tabIndex={-1}
        data-reorder-id={canDragProject ? section.id : undefined}
        data-reorder-kind={canDragProject ? "project" : undefined}
        onPointerDown={canDragProject ? onHeadingDragStart : undefined}
        className={cn(
          SECTION_HEADING_ROW,
          "cs-project-heading group/heading relative",
          sectionOpen && "mb-1",
        )}
      >
        {/* Threads without a project read as a plain heading: no glyph slot. */}
        {section.personal ? null : (
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
        )}
        <button
          type="button"
          title={section.name}
          onClick={() => {
            if (ctx.consumeSuppressedClick(section.id)) return;
            onToggleProject();
          }}
          className="flex min-h-5 min-w-0 flex-1 items-center rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9"
        >
          <span className={cn(SECTION_HEADING_LABEL, "cs-project-name")}>
            {section.name}
            {section.known ? null : (
              <span className="text-sidebar-foreground/73"> (unknown)</span>
            )}
          </span>
          {section.personal ? (
            <Icon
              name="ChevronRight"
              aria-hidden="true"
              className={cn(
                "ml-1 size-3.5 shrink-0 text-sidebar-foreground/73 opacity-0 transition-transform duration-150 ease-out motion-reduce:transition-none group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100",
                sectionOpen && "rotate-90",
              )}
            />
          ) : null}
        </button>
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
