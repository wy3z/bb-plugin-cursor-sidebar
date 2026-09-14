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
  useRpc,
  useBbNavigate,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { SidebarActions } from "./SidebarActions";
import { ProjectChecklist } from "./ProjectChecklist";
import { NewProjectAction } from "./NewProjectAction";
import { cn } from "@/lib/utils";
import { isProtectedInteractionTarget } from "./settle-shortcut";
import {
  activePathIds,
  buildSections,
  flattenShelf,
  scopeOf,
  type ProjectSectionData,
  type SiblingOrdering,
} from "./forest";
import type { projectSidebarRpcContract } from "./server";
import { ShelfList, TREE_CHILD_INDENT, type TreeContext } from "./ThreadTree";
import { descendantsOf, resolveThreadDisplayTitles, threadDisplayTitle, visibleInboxThreads } from "./inbox";
import {
  chatsFolderRegistry,
  coreNativeFolderIds,
  homeKindOf,
  nativeProjectSectionId,
  NATIVE_PROJECT_PREFIX,
  projectSectionId,
  projectThreadView,
  STANDALONE,
} from "./membership";
import {
  buildCoreIndex,
  coreRowRole,
  coresWithUnresolvedTransfers,
  ownershipHint,
  unattributedTransfers,
  unresolvedTransfersForCore,
  type CoreRowRole,
  type ThreadOwnershipHint,
} from "./core-ownership";
import {
  EMPTY_CORE_EXACT_FACTS,
  summarizeSection,
  worstThreadStatus,
  type ThreadStatusKind,
} from "./status";
import { useCoreAttention, nativeAttentionSignature } from "./useCoreAttention";
import { listeningHealthLabel } from "./listening-health";
import { planAttentionReveal, planListeningAction, reachableRevealTargets } from "./core-nav";
import { pinAllowed, planPinWrites } from "./pin-scope";
import { planConversations } from "./conversations";
import { useWorkspaces } from "./useWorkspaces";
import { usePrimaryHost } from "./usePrimaryHost";
import { MoveToProjectDialog } from "./MoveToProjectDialog";
import { StartProjectFromThreadDialog } from "./StartProjectFromThreadDialog";
import { AssociateToProjectDialog } from "./AssociateToProjectDialog";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { CreateNativeProjectDialog } from "./CreateNativeProjectDialog";
import { ReinitializeCoreDialog } from "./ReinitializeCoreDialog";
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
  usePersistentIds,
} from "./collapse";
import { useProjectVisibility } from "./useProjectVisibility";
import { useThreadSections } from "./useThreadSections";
import { useSidebarView } from "./useSidebarView";
import { SidebarViewMenu, SidebarViewSyncNotice } from "./SidebarViewMenu";
import {
  environmentFilterOptions,
  familyAwareComparator,
  filterOrdinaryThreads,
  homeDisplayParentOf,
  ordinaryCollapsibleTargets,
  ordinaryFamilyFacts,
  ordinaryFamilyGroupKeys,
  ordinaryThreadStatus,
  environmentIdentityOf,
  unreadOrdinaryThreadIds,
  viewHasActiveFilters,
} from "./sidebar-view";
import { DeleteFolderDialog, FolderNameDialog, MoveToFolderDialog } from "./FolderDialogs";
import {
  familyIds,
  familyRootId,
  planFolderMove,
  standaloneGroupKey,
  type FolderMoveResult,
} from "./standalone-groups";
import type { ThreadShelf } from "./lifecycle";
import { ageGroupKey, personalAgeGroups, type AgeGroup } from "./age-groups";
import { ManagerCreate } from "./ManagerCreate";
import { useManagers } from "./useManagers";
import { ProjectStatusGlyph, ACTIVITY_LABELS, glyphStateForStatus } from "./ProjectStatusGlyph";
import { AnimatedList } from "./AnimatedList";

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * A stable identity for one user ownership operation. The backend dedupes by
 * this key, so a repeated submission resolves the original request instead of
 * moving the family twice.
 */
function newRequestKey(scope: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${random}`.slice(0, 200);
}

/**
 * Project-grouped thread list. BB's projects are the only containers, the
 * native personal container is shown as Threads, and settled threads sit in
 * one collapsed section under the thread list rather than a shelf per project.
 */
export function ProjectSidebar({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const { status, threads: rawThreads, projects: nativeProjects } = useSidebarThreads();
  // The native sidebar feed signature. It updates exactly when the host's own
  // thread list does, so it is the existing native signal both the manager
  // projection and the per-Core attention read refresh on. No timer.
  const feedKey = useMemo(() => nativeAttentionSignature(rawThreads), [rawThreads]);
  const managers = useManagers(feedKey);
  const cores = managers.projects;
  const coreIndex = useMemo(
    () => buildCoreIndex(cores, managers.workers, managers.ownership, managers.ownershipObservation),
    [cores, managers.workers, managers.ownership, managers.ownershipObservation],
  );
  // Bounded, deduplicated per-Core reads: exact-generation attention, native
  // Listening health and pending handovers. Refreshed by the manager's own
  // channel, never per row and never on a timer.
  const coreSummaryKey = useMemo(
    () => cores.map((core) => `${core.id}:${core.coordinatorThreadId ?? ""}`).join(","),
    [cores],
  );
  const coreAttention = useCoreAttention(
    useMemo(() => cores.map((core) => core.id), [cores]),
    `${coreSummaryKey}\u0001${feedKey}`,
  );
  const [creatingManager, setCreatingManager] = useState<{ id: string; name: string } | null>(null);
  const [creatingCorePicker, setCreatingCorePicker] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [reinitializingManager, setReinitializingManager] = useState<{ id: string; name: string } | null>(null);
  const [openingManager, setOpeningManager] = useState<string | null>(null);
  const [deletingManager, setDeletingManager] = useState<{ id: string; name: string } | null>(null);
  const coreSections = useMemo(
    () => cores.filter((core) => core.coordinatorThreadId).map((core) => ({ id: projectSectionId(core.id), name: core.name, isPersonal: false })),
    [cores],
  );
  const nativeProjectSections = useMemo(
    () => nativeProjects.filter((project) => !project.isPersonal).map((project) => ({ id: nativeProjectSectionId(project.id), name: project.name, isPersonal: false })),
    [nativeProjects],
  );
  const projects = useMemo(
    () => [...coreSections, ...nativeProjectSections, { id: STANDALONE, name: "Chats", isPersonal: true }],
    [coreSections, nativeProjectSections],
  );
  const managerByProject = useMemo(() => new Map(cores.map((manager) => [projectSectionId(manager.id), manager])), [cores]);
  const managerIds = useMemo(() => new Set(cores.flatMap((manager) => manager.coordinatorThreadId ? [manager.coordinatorThreadId] : [])), [cores]);
  const managedWorkers = useMemo(() => new Map(managers.workers.map((worker) => [worker.threadId, worker])), [managers.workers]);
  const projectedThreads = useMemo(() => projectThreadView(rawThreads, coreIndex, nativeProjects), [rawThreads, coreIndex, nativeProjects]);
  const threads = useMemo(() => resolveThreadDisplayTitles(projectedThreads), [projectedThreads]);
  const projectedById = useMemo(() => new Map(projectedThreads.map((thread) => [thread.id, thread])), [projectedThreads]);
  const workspacePaths = useWorkspaces(rawThreads);
  const primaryHostId = usePrimaryHost();
  const rawById = useMemo(() => new Map(rawThreads.map((thread) => [thread.id, thread])), [rawThreads]);
  // Archived native threads the list does not render as rows; the reveal action
  // can still open one directly by its real native thread id.
  const archivedIds = useMemo(
    () => new Set(rawThreads.filter((thread) => thread.isArchived).map((thread) => thread.id)),
    [rawThreads],
  );
  const protectedIds = useMemo(() => new Set([...managerIds, ...managedWorkers.keys()]), [managerIds, managedWorkers]);
  const parentOfId = useCallback(
    (id: string): string | null => rawById.get(id)?.parentThreadId ?? null,
    [rawById],
  );
  /** How a Core-owned row sits under its Core, or null when it is ordinary. */
  const coreRoleOf = useCallback((threadId: string): CoreRowRole | null => {
    const coreId =
      coreIndex.coreByCoordinator.get(threadId) ??
      coreIndex.coreByWorker.get(threadId) ??
      coreIndex.coreByMember.get(threadId) ??
      coreIndex.coreByOwnedRoot.get(threadId);
    if (coreId === undefined) return null;
    return coreRowRole(coreId, threadId, coreIndex);
  }, [coreIndex]);
  /** Verified, unverified or reference provenance for an ordinary row. */
  const ownershipHintOf = useCallback(
    (threadId: string): ThreadOwnershipHint | null => ownershipHint(threadId, parentOfId, coreIndex),
    [coreIndex, parentOfId],
  );
  // Removing a family from a Core is a mutating move; it needs the current
  // verified read, never a stale snapshot. The Core-owned home still shows.
  const canRemoveFromCore = useCallback(
    (threadId: string) => managers.ownershipCurrent && coreRoleOf(threadId) === "owned-chat",
    [managers.ownershipCurrent, coreRoleOf],
  );
  const conflictedCores = useMemo(() => coresWithUnresolvedTransfers(coreIndex), [coreIndex]);
  // Unresolved transfers whose recorded identities name no known Core. They are
  // never attributed to a family's current owner; the global region reconciles
  // them by their recorded request key.
  const unattributed = useMemo(() => unattributedTransfers(coreIndex), [coreIndex]);
  const coreNameById = useMemo(
    () => new Map(cores.map((core) => [core.id, core.name] as const)),
    [cores],
  );
  const canMove = useCallback((threadId: string) => {
    if (!managers.membershipAvailable) return false;
    // An owned family's move changes Core ownership, which needs a current
    // verified read. A still-unowned ordinary chat can be adopted without one.
    if (coreRoleOf(threadId) !== null && !managers.ownershipCurrent) return false;
    let current = rawById.get(threadId);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      // Crossing a Core coordinator above an owned family root is expected;
      // the family is transferable to another Core. A Worker anywhere on the
      // path, or the coordinator itself, is not.
      if (current.id !== threadId && coreIndex.coreByCoordinator.has(current.id)) return true;
      if (protectedIds.has(current.id)) return false;
      seen.add(current.id);
      current = current.parentThreadId ? rawById.get(current.parentThreadId) : undefined;
    }
    return true;
  }, [coreIndex, coreRoleOf, managers.membershipAvailable, managers.ownershipCurrent, protectedIds, rawById]);
  // "Start project from thread" is for a chat that is not already part of a
  // managed project. A native working-directory membership is not managed
  // membership, so standalone chats in a shared working directory still qualify.
  const canStartProject = useCallback((threadId: string) => {
    if (!managers.available || !managers.membershipAvailable) return false;
    const projected = projectedById.get(threadId);
    if (!projected || projected.isArchived) return false;
    // Eligibility is actual ownership, not the displayed home: a chat under a
    // native Project can still start a Core, while an owned or assigned family
    // cannot. A reference link does not make a chat owned.
    return coreRoleOf(threadId) === null;
  }, [coreRoleOf, managers.available, managers.membershipAvailable, projectedById]);
  const [movingThreadId, setMovingThreadId] = useState<string | null>(null);
  const [startingProjectThreadId, setStartingProjectThreadId] = useState<string | null>(null);
  const [associating, setAssociating] = useState<{
    threadId: string;
    projectId: string | null;
    mode: "handover" | "reference";
  } | null>(null);
  // A chat (standalone or already in a managed project) can be handed over or
  // added as a reference to another project. The native worker/PM family guard
  // is the same one `canMove` applies, and the backend re-checks it.
  const canAssociate = canMove;
  const openAssociation = useCallback(
    (threadId: string, projectId: string | null = null, mode: "handover" | "reference" = "handover") => {
      setAssociating({ threadId, projectId, mode });
    },
    [],
  );
  const threadOrders = useThreadOrders();
  const threadOrdersRef = useRef(threadOrders);
  threadOrdersRef.current = threadOrders;
  const rpc = useRpc<typeof projectSidebarRpcContract>();
  const actions = useSidebarThreadActions();
  const navigate = useBbNavigate();

  // "Today +" opens BB's native composer with the personal project selected —
  // the projectless "Don't work in a project" mode. Naming it explicitly
  // overrides the remembered root-compose project so a new thread never lands
  // in whatever project was last used. No managed project is involved.
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

  async function openProjectManager(section: { id: string; name: string }) {
    if (openingManager) return;
    const manager = managerByProject.get(section.id);
    if (!manager) {
      // A section without a stable Core record has no native project identity
      // to start one against. Refuse instead of guessing an id.
      toast.error("This Core is unavailable. Refresh and retry.");
      return;
    }
    if (!manager.coordinatorThreadId) {
      // The composer request must name the BB-native project id, never the
      // sidebar's `managed:` section key or the Exo Core id. The manager
      // reopens the existing Core for this native project, so a stable Core is
      // never duplicated.
      setCreatingManager({ id: manager.bbProjectId, name: manager.name });
      return;
    }
    setOpeningManager(section.id);
    try {
      const result = await rpc.call("openManager", { managerId: manager.id });
      if (!result.coordinatorThreadId) throw new Error("The Core is unavailable. Retry shortly.");
      navigate.toThread(result.coordinatorThreadId);
      onNavigate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningManager(null);
    }
  }

  async function deleteManagedProject(managerId: string) {
    await rpc.call("deleteManager", { managerId });
    await managers.refresh();
    setAnnouncement("Core deleted. Its chats remain as an ordinary family.");
    toast.success("Core deleted. Chats and workspaces kept; its native family remains.");
  }

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
  const expandedAges = usePersistentIds(EXPANDED_AGES_KEY);
  const collapsedGroups = usePersistentIds(COLLAPSED_GROUPS_KEY);
  // Top-level group headings (Core / Projects / Chats) default open; this set
  // holds the folded ones and is a device preference, not shared state.
  const topGroupCollapsed = usePersistentIds("bb-plugin-project-sidebar:collapsed-top-groups:v1");
  const folderStore = useThreadSections();
  // Native sections that file a Core coordinator are not Chats folders. The
  // Core family already has its home under Core; keeping them in the registry
  // would draw a second copy of the same family under Chats.
  const coreFolderIds = useMemo(
    () => coreNativeFolderIds(rawThreads, coreIndex),
    [coreIndex, rawThreads],
  );
  const chatFolders = useMemo(
    () => chatsFolderRegistry(folderStore.sections, coreFolderIds),
    [coreFolderIds, folderStore.sections],
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
  const [folderMoveThreadId, setFolderMoveThreadId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  const hiddenProjects = useProjectVisibility();
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

  // The exact-generation status of every Core-owned row. A row surfaces a
  // current failure, review or queue even when its native indicator is silent.
  // The value is the strongest status across the row and its rendered subtree,
  // so a folded parent still speaks for a failed child.
  const coreStatusByThread = useMemo(() => {
    const map = new Map<string, ThreadStatusKind>();
    const ownerOf = (id: string): string | undefined =>
      coreIndex.coreByCoordinator.get(id) ??
      coreIndex.coreByWorker.get(id) ??
      coreIndex.coreByMember.get(id) ??
      coreIndex.coreByOwnedRoot.get(id);
    for (const thread of visible) {
      const coreId = ownerOf(thread.id);
      if (coreId === undefined) continue;
      const exact = coreAttention.get(coreId);
      if (exact === undefined) continue;
      const subtree = [thread, ...(descendantsById.get(thread.id) ?? [])];
      map.set(thread.id, worstThreadStatus(subtree, exact));
    }
    return map;
  }, [visible, descendantsById, coreIndex, coreAttention]);

  const reportOwnership = useCallback((result: { phase: string; threadIds: string[]; currentMismatch: string | null }, destination: string | null) => {
    const count = result.threadIds.length;
    const family = `${count} chat${count === 1 ? "" : "s"}`;
    if (result.phase === "verified") {
      setAnnouncement(destination ? `${family} moved to the Core.` : `${family} removed from the Core.`);
      toast.success(destination ? "Chat family moved to Core" : "Chat family returned to its native home");
      return;
    }
    if (result.phase === "conflict") {
      const detail = result.currentMismatch ?? "The native parent changed while the move was running.";
      setAnnouncement(`Ownership conflict: ${detail}`);
      toast.error("Ownership conflict. The list shows the current state.", { description: detail });
      return;
    }
    if (result.phase === "uncertain") {
      setAnnouncement("The move could not be verified. Nothing was guessed; retry from the current state.");
      toast.error("The move could not be verified.", { description: result.currentMismatch ?? undefined });
      return;
    }
    setAnnouncement("The move did not complete. The list shows the current state.");
    toast.error("The move did not complete.", { description: result.currentMismatch ?? undefined });
  }, []);

  const moveMembership = useCallback(async (threadId: string, coreId: string | null) => {
    if (coreRoleOf(threadId) !== null && !managers.ownershipCurrent) {
      toast.error("Ownership status is unavailable. Nothing was moved; refresh and retry.");
      return;
    }
    const result = coreId === null
      ? await rpc.call("removeThreadFromCore", { threadId, requestKey: newRequestKey("sidebar-remove") })
      : await rpc.call("moveThreadToCore", { threadId, projectId: coreId, requestKey: newRequestKey("sidebar-move") });
    await managers.refresh();
    reportOwnership(result, coreId);
  }, [coreRoleOf, managers.ownershipCurrent, managers.refresh, reportOwnership, rpc]);
  const moveMembershipRef = useRef(moveMembership);
  moveMembershipRef.current = moveMembership;

  // An explicit provenance resolution for one unverified legacy association.
  // Nothing is inferred: the user states ownership or reference.
  const resolveLegacy = useCallback(async (
    threadId: string,
    coreId: string,
    provenance: "ownership" | "reference",
  ) => {
    try {
      const result = await rpc.call("convertLegacyAssociation", { threadId, projectId: coreId, provenance });
      await managers.refresh();
      const message = result.action === "moved"
        ? "Core ownership confirmed."
        : "Kept as a reference. Its home is unchanged.";
      setAnnouncement(message);
      toast.success(message);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setAnnouncement(`Could not resolve the association: ${detail}`);
      toast.error("Could not resolve the association", { description: detail });
    }
  }, [managers.refresh, rpc]);

  const reconcileCore = useCallback(async (coreId: string) => {
    const transfers = unresolvedTransfersForCore(coreId, coreIndex);
    if (transfers.length === 0) return;
    let verified = 0;
    let unresolved = 0;
    let refusal: string | null = null;
    for (const transfer of transfers) {
      try {
        const result = await rpc.call("reconcileOwnershipTransfer", { requestKey: transfer.requestKey });
        if (result.phase === "verified") verified += 1;
        else unresolved += 1;
      } catch (cause) {
        refusal = cause instanceof Error ? cause.message : String(cause);
      }
    }
    await managers.refresh();
    if (refusal !== null) {
      setAnnouncement(`Reconcile could not run: ${refusal}`);
      toast.error("Reconcile could not run", { description: refusal });
      return;
    }
    const message = unresolved === 0
      ? `Reconciled ${verified} transfer${verified === 1 ? "" : "s"}.`
      : `${verified} resolved, ${unresolved} still unresolved. The list shows the observed state.`;
    setAnnouncement(message);
    toast.success(message);
  }, [coreIndex, managers.refresh, rpc]);

  // Unattributed transfers have no recorded source or receiver, so no Core can
  // own the reconciliation. The global region reconciles each by its recorded
  // request key against the manager, which is the only proof available.
  const reconcileUnattributed = useCallback(async () => {
    if (unattributed.length === 0) return;
    let verified = 0;
    let unresolved = 0;
    let refusal: string | null = null;
    for (const transfer of unattributed) {
      try {
        const result = await rpc.call("reconcileOwnershipTransfer", { requestKey: transfer.requestKey });
        if (result.phase === "verified") verified += 1;
        else unresolved += 1;
      } catch (cause) {
        refusal = cause instanceof Error ? cause.message : String(cause);
      }
    }
    await managers.refresh();
    if (refusal !== null) {
      setAnnouncement(`Reconcile could not run: ${refusal}`);
      toast.error("Reconcile could not run", { description: refusal });
      return;
    }
    const message = unresolved === 0
      ? `Reconciled ${verified} transfer${verified === 1 ? "" : "s"}.`
      : `${verified} resolved, ${unresolved} still unresolved. The list shows the observed state.`;
    setAnnouncement(message);
    toast.success(message);
  }, [unattributed, managers.refresh, rpc]);

  // A reference is a non-owning link. Its marker offers navigation to the
  // existing Core workspace without creating a second home, changing ownership
  // or waking the Core.
  const openReferenceCore = useCallback(async (coreId: string) => {
    const core = cores.find((candidate) => candidate.id === coreId);
    if (!core) {
      toast.error("That Core is unavailable. Refresh and retry.");
      return;
    }
    if (core.coordinatorThreadId) {
      navigate.toThread(core.coordinatorThreadId);
      onNavigate();
      return;
    }
    const section = coreSections.find((candidate) => candidate.id === projectSectionId(coreId));
    if (!section) {
      toast.error("That Core is unavailable. Refresh and retry.");
      return;
    }
    await openProjectManager(section);
  }, [cores, coreSections, navigate, onNavigate]);

  // Defined after the section memos; the drag commit reads it at drop time.
  const commitFolderPinDropRef = useRef<(movingId: string, moveToSection: string | null | undefined, pin: boolean | undefined) => Promise<void>>(async () => {});
  const applyFolderMoveRef = useRef<(threadId: string, sectionId: string | null) => Promise<FolderMoveResult>>(async () => {
    throw new Error("Standalone chats are unavailable.");
  });

  // Ordinary homes (a native Project or Chats) own their pins and folders, and
  // filing or pinning never crosses a managed worker or coordinator. A Core home
  // has no folders and never lifts a family: a child's own native pin only
  // orders its siblings, which is harmless pin metadata, so the ownership-family
  // walk is skipped there rather than forbidding the pin.
  const canPin = useCallback((threadId: string) => {
    const projected = projectedById.get(threadId);
    if (!projected) return false;
    const homeKind = homeKindOf(projected.projectId);
    if (homeKind === "core") return pinAllowed("core", projected.isArchived, false);
    let crossedProtected = false;
    let current = rawById.get(threadId);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (protectedIds.has(current.id)) {
        crossedProtected = true;
        break;
      }
      seen.add(current.id);
      current = current.parentThreadId ? rawById.get(current.parentThreadId) : undefined;
    }
    return pinAllowed(homeKind, projected.isArchived, crossedProtected);
  }, [projectedById, protectedIds, rawById]);

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
        committed.moveToProject === undefined &&
        !manualOrderRef.current &&
        homeKindOf(committed.sectionId) !== "core"
      ) {
        return;
      }
      // Folder and pin headers own the drop: the family is filed or (un)pinned
      // with native state, never reordered across clusters and never moved
      // between projects.
      if (committed.kind === "thread" && (committed.moveToSection !== undefined || committed.pin !== undefined)) {
        void commitFolderPinDropRef.current(committed.movingId, committed.moveToSection, committed.pin);
        return;
      }
      if (committed.kind === "thread" && committed.moveToProject !== undefined) {
        // Dropping onto a Core runs the same ownership transfer as Move to
        // Core…; dropping onto Chats releases a Core-owned family back to its
        // native home. No association dialog: the drop states the intent.
        void moveMembershipRef.current(committed.movingId, committed.moveToProject).catch((error) => toast.error(String(error)));
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
    [rpc],
  );
  const drag = useReorderDrag(onDragCommit, canMove);

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
    () => baseOrderedProjects.filter((project) => !project.isPersonal && project.id.startsWith(NATIVE_PROJECT_PREFIX) && !hiddenProjects.ids.has(project.id)).map((project) => project.id),
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
  manualOrderRef.current = view.sortConversationsBy === "manual";
  const isCoreHomeThread = useCallback(
    (thread: PluginSidebarThread) => homeKindOf(thread.projectId) === "core",
    [],
  );
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
  const viewVisible = useMemo(
    () =>
      filterOrdinaryThreads(visible, view, {
        isCoreHome: isCoreHomeThread,
        bypass: (thread) => {
          const root = familyRootOfId(thread.id);
          return pinnedFamilyRoots.has(root) || root === activeFamilyRoot;
        },
      }),
    [activeFamilyRoot, familyRootOfId, isCoreHomeThread, pinnedFamilyRoots, visible, view],
  );
  const viewEnvironmentOptions = useMemo(
    () => environmentFilterOptions(visible.filter((thread) => !isCoreHomeThread(thread))),
    [isCoreHomeThread, visible],
  );
  const hasEnvironmentlessOrdinary = useMemo(
    () =>
      visible.some(
        (thread) => !isCoreHomeThread(thread) && environmentIdentityOf(thread) === null,
      ),
    [isCoreHomeThread, visible],
  );
  const unreadOrdinary = useMemo(
    () => unreadOrdinaryThreadIds(visible, (id) => coreRoleOf(id) !== null),
    [coreRoleOf, visible],
  );
  // Automatic ordering reads the same family facts the grouping shows, so a
  // family sorts by the status or activity its divider shows. Facts come from
  // the complete visible set with same-home display parents, before any fold.
  const siblingOrdering = useMemo<SiblingOrdering | undefined>(() => {
    if (view.sortConversationsBy === "manual") return undefined;
    const facts = ordinaryFamilyFacts(viewVisible, {
      parentOf: homeDisplayParentOf(viewVisible),
      statusOf: ordinaryThreadStatus,
      environmentOf: environmentIdentityOf,
    });
    const compare = familyAwareComparator(view.sortConversationsBy, facts);
    return compare === null ? undefined : { compare, manual: false };
  }, [view.sortConversationsBy, viewVisible]);
  // A Core home keeps the native sibling order and manual moves; the ordinary
  // Projects/Chats homes take the selected automatic order.
  const orderingFor = useCallback(
    (sectionId: string): SiblingOrdering | undefined =>
      homeKindOf(sectionId) === "core" ? undefined : siblingOrdering,
    [siblingOrdering],
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
  // Callers gate on `canPin`, so a Core home never reaches these paths.
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
        homeKind: "project",
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
      homeKind: "project",
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

  // Core home: a pin is this thread's own native flag, so it only reorders
  // siblings. It never writes the family root or clears another member's pin.
  const applySiblingPin = useCallback(async (
    threadId: string,
    pinned: boolean,
  ): Promise<void> => {
    const writes = planPinWrites({
      homeKind: "core",
      threadId,
      rootId: threadId,
      familyIds: [threadId],
      pinnedMemberIds: [],
      pinned,
    });
    for (const write of writes) await actions.setPinned(write.threadId, write.pinned);
  }, [actions]);

  const togglePin = useCallback(async (threadId: string, pinned: boolean): Promise<void> => {
    const section = homeSectionOf(threadId);
    const isCore = section !== undefined && homeKindOf(section.id) === "core";
    try {
      if (isCore) {
        await applySiblingPin(threadId, pinned);
        const moved = visibleById.get(threadId);
        const title = moved ? threadDisplayTitle(moved) : "Chat";
        setAnnouncement(`${title} ${pinned ? "pinned" : "unpinned"}.`);
        return;
      }
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
  }, [applyFamilyPin, applySiblingPin, homeSectionOf, visibleById]);

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
    // A Core home draws no folder or Pinned cluster, so there is no drop target.
    // Its row-menu pin is the sibling-only toggle, never a family lift.
    if (homeKindOf(section.id) === "core") return;
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
      const scope = scopeOf(section, thread.id);
      // Reorder stays inside one visible automatic group (pinned, one folder,
      // or the selected Workspace/Updated/Status/Environment group), so a drag
      // never crosses groups, files, pins or duplicates a family.
      const memberById = homeKindOf(section.id) !== "core" && shelf === "active"
        ? new Map(section.members.map((member) => [member.id, member]))
        : null;
      const groupKeys = homeKindOf(section.id) !== "core" && shelf === "active"
        ? ordinaryFamilyGroupKeys(section.members, view, {
            now,
            parentOf: (id) => section.forest.parent.get(id) ?? null,
            statusOf: ordinaryThreadStatus,
            environmentOf: environmentIdentityOf,
          })
        : null;
      const groupKeyOf = memberById === null || groupKeys === null ? null : (threadId: string): string => {
        return standaloneGroupKey({
          threadId,
          parentOf: (id) => section.forest.parent.get(id) ?? null,
          sectionIdOf: (id) => memberById.get(id)?.sectionId ?? null,
          isPinned: (id) => memberById.get(id)?.isPinned ?? false,
          knownFolderIds,
          ageGroupOf: (id) => groupKeys.get(id) ?? null,
        });
      };
      const sourceKey = groupKeyOf?.(thread.id) ?? null;
      const ids = flattenShelf(section, shelf, (id) => managerIds.has(id) || expandedParents.has(id))
        .filter((row) => scopeOf(section, row.thread.id) === scope)
        .filter((row) => groupKeyOf === null || sourceKey === null || groupKeyOf(row.thread.id) === sourceKey)
        .map((row) => row.thread.id);
      drag.startThread(event, section.id, scope, ids, thread.id);
    },
    [drag, expandedParents, knownFolderIds, managerIds, now, view],
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
    if (activeThreadId === null || managerIds.has(activeThreadId)) return null;
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
    // The generated key is the same one the renderer derives, so a reveal opens
    // the real date, status or environment group that holds the active family.
    let updatedAgeKey: string | null = null;
    let collapsedGroupKey: string | null = null;
    if (homeKindOf(sectionId) !== "core") {
      const keys = ordinaryFamilyGroupKeys(section.members, view, {
        now,
        parentOf: (id) => section.forest.parent.get(id) ?? null,
        statusOf: ordinaryThreadStatus,
        environmentOf: environmentIdentityOf,
      });
      const key = keys.get(activeThreadId) ?? null;
      if (key !== null && view.groupBy === "updated") {
        updatedAgeKey = ageGroupKey(sectionId, key.slice("updated:".length) as AgeGroup);
      } else if (key !== null && (view.groupBy === "status" || view.groupBy === "environment")) {
        collapsedGroupKey = `group:${sectionId}:${key}`;
      }
    }
    return {
      sectionId,
      updatedAgeKey,
      collapsedGroupKey,
      shelf: section.shelfById.get(activeThreadId) ?? "active",
      ancestors,
    };
  }, [activeThreadId, now, sectionByThreadId, sectionsById, managerIds, view]);

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
    topGroupCollapsed.remove(
      homeKindOf(reveal.sectionId) === "core"
        ? "core"
        : homeKindOf(reveal.sectionId) === "project"
          ? "projects"
          : "chats",
    );
    // Never permanently open a collapsed project on selection: a collapsed
    // project shows only the selected conversation (the exception row) and
    // keeps its stored expansion. Per-conversation ancestor folding below is
    // transient view state, not the persisted project expansion.
    if (reveal.updatedAgeKey) expandedAges.add(reveal.updatedAgeKey);
    if (reveal.collapsedGroupKey) collapsedGroups.remove(reveal.collapsedGroupKey);
    setExpandedParents((current) => new Set([...current, ...reveal.ancestors]));
  }, [activeThreadId, reveal, expandedAges, collapsedGroups, topGroupCollapsed]);

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
      // An automatic conversation order disables manual moves in an ordinary
      // home only; a Core home keeps its native sibling moves.
      if (view.sortConversationsBy !== "manual" && homeKindOf(section.id) !== "core") {
        return false;
      }
      const scope = scopeOf(section, threadId);
      const memberById = homeKindOf(section.id) !== "core" && shelf === "active"
        ? new Map(section.members.map((member) => [member.id, member]))
        : null;
      const groupKeys = homeKindOf(section.id) !== "core" && shelf === "active"
        ? ordinaryFamilyGroupKeys(section.members, view, {
            now,
            parentOf: (id) => section.forest.parent.get(id) ?? null,
            statusOf: ordinaryThreadStatus,
            environmentOf: environmentIdentityOf,
          })
        : null;
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
      const all = flattenShelf(section, shelf, (id) => managerIds.has(id) || expandedParents.has(id))
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
    [expandedParents, knownFolderIds, managerIds, now, sectionByThreadId, sectionsById, threadOrders, view.sortConversationsBy, visibleById],
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
      coordinatorIds: managerIds,
      onMove: setMovingThreadId,
      canMove,
      onStartProject: setStartingProjectThreadId,
      canStartProject,
      onHandOver: (threadId: string) => openAssociation(threadId, null, "handover"),
      onReference: (threadId: string) => openAssociation(threadId, null, "reference"),
      onRemoveFromCore: (threadId: string) => {
        void moveMembershipRef.current(threadId, null).catch((error) => toast.error(String(error)));
      },
      coreRoleOf,
      ownershipHintOf,
      coreNameOf: (coreId: string) => coreNameById.get(coreId) ?? null,
      onConfirmOwnership: (threadId: string, coreId: string) => {
        void resolveLegacy(threadId, coreId, "ownership");
      },
      onKeepAsReference: (threadId: string, coreId: string) => {
        void resolveLegacy(threadId, coreId, "reference");
      },
      canRemoveFromCore,
      canAssociate,
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
      sectionsAvailable: folderStore.available,
      collapsedGroups: collapsedGroups.ids,
      onToggleGroup: collapsedGroups.toggle,
      onMoveToFolder: setFolderMoveThreadId,
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
      /** Exact-generation status over a Core row's subtree, when it has one. */
      statusOf: (threadId: string) => coreStatusByThread.get(threadId),
      folderDropTarget: drag.state?.kind === "thread" ? drag.state.overTarget : null,
      onOpenReferenceCore: (coreId: string) => {
        void openReferenceCore(coreId);
      },
    }),
    [
      managerIds, canMove, canStartProject, canAssociate, openAssociation, rawById, workspacePaths, primaryHostId, nativeProjects,
      activeThreadId,
      canPin,
      coreStatusByThread,
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
      coreRoleOf,
      ownershipHintOf,
      resolveLegacy,
      canRemoveFromCore,
      openReferenceCore,
      coreNameById,
      view,
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

  const visibleSections = sections.filter(
    (section) => section.personal || !hiddenProjects.ids.has(section.id),
  );
  const sectionKind = (section: ProjectSectionData): "core" | "project" | "chats" =>
    section.personal ? "chats" : homeKindOf(section.id);
  const coreSectionsVisible = visibleSections.filter(
    (section) =>
      sectionKind(section) === "core" &&
      (managerByProject.has(section.id) || section.members.length > 0),
  );
  const nativeSectionsVisible = visibleSections.filter(
    (section) =>
      sectionKind(section) === "project" &&
      (section.byShelf.active.length > 0 || section.byShelf.settled.length > 0 ||
        (section.known && section.members.length === 0)),
  );
  const chatSectionsVisible = visibleSections.filter((section) => section.personal);

  const renamingFolder = renamingFolderId
    ? folderStore.sections.find((folder) => folder.id === renamingFolderId) ?? null
    : null;
  const deletingFolder = deletingFolderId
    ? folderStore.sections.find((folder) => folder.id === deletingFolderId) ?? null
    : null;
  const folderMoveThread = folderMoveThreadId ? rawById.get(folderMoveThreadId) ?? null : null;
  const folderMoveCurrent: string | null = (() => {
    if (!folderMoveThreadId) return null;
    const section = homeSectionOf(folderMoveThreadId);
    if (!section) return null;
    const root = familyRootId((id) => section.forest.parent.get(id) ?? null, folderMoveThreadId);
    const rootSection = rawById.get(root)?.sectionId ?? null;
    return rootSection !== null && knownFolderIds.has(rootSection) ? rootSection : null;
  })();
  const deletingFolderChats = (() => {
    if (!deletingFolderId) return 0;
    // A folder is global, so its families may sit in any ordinary home. Count
    // each filed family once from the home that renders it.
    const seen = new Set<string>();
    let count = 0;
    for (const section of sections) {
      if (homeKindOf(section.id) === "core") continue;
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

  const [markReadBusy, setMarkReadBusy] = useState(false);
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
  const bulkTopGroupKeys = ["core", "projects", "chats"];
  const bulkSectionIds = visibleSections.map((section) => section.id);
  const bulkTargets = useMemo(
    () =>
      ordinaryCollapsibleTargets(
        visibleSections.map((section) => ({
          id: section.id,
          isCore: homeKindOf(section.id) === "core",
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
    [environmentIdentityOf, knownFolderIds, now, ordinaryThreadStatus, view, visibleSections],
  );
  const anyCollapsed =
    bulkTopGroupKeys.some((key) => topGroupCollapsed.ids.has(key)) ||
    bulkSectionIds.some((id) => !expandedProjects.ids.has(id)) ||
    [...bulkTargets.groupKeys].some((key) => collapsedGroups.ids.has(key)) ||
    [...bulkTargets.ageKeys].some((key) => !expandedAges.ids.has(key)) ||
    [...bulkTargets.parentIds].some((id) => !expandedParents.has(id));
  const expandAll = useCallback(() => {
    topGroupCollapsed.removeMany(bulkTopGroupKeys);
    expandedProjects.addMany(bulkSectionIds);
    collapsedGroups.removeMany(bulkTargets.groupKeys);
    expandedAges.addMany(bulkTargets.ageKeys);
    setExpandedParents((current) => new Set([...current, ...bulkTargets.parentIds]));
  }, [bulkSectionIds, bulkTargets, bulkTopGroupKeys, collapsedGroups, expandedAges, expandedProjects, topGroupCollapsed]);
  const collapseAll = useCallback(() => {
    topGroupCollapsed.addMany(bulkTopGroupKeys);
    expandedProjects.removeMany(bulkSectionIds);
    collapsedGroups.addMany(bulkTargets.groupKeys);
    expandedAges.removeMany(bulkTargets.ageKeys);
    setExpandedParents((current) => {
      const next = new Set(current);
      for (const id of bulkTargets.parentIds) next.delete(id);
      return next;
    });
  }, [bulkSectionIds, bulkTargets, bulkTopGroupKeys, collapsedGroups, expandedAges, expandedProjects, topGroupCollapsed]);

  const renderSection = (section: ProjectSectionData) => {
    const kind = sectionKind(section);
    const isCore = kind === "core";
    const manager = managerByProject.get(section.id);
    const coordinatorThreadId = manager?.coordinatorThreadId;
    const sectionThreads = projectedThreads.filter((thread) => thread.projectId === section.id);
    // A Core's counts come from its own exact-generation read. A stale or
    // failed read is marked unavailable; a native Project home has no Core
    // ledger and is simply unread, never unavailable.
    const attentionState = manager ? coreAttention.get(manager.id) : undefined;
    const exact = isCore
      ? attentionState ?? EMPTY_CORE_EXACT_FACTS
      : { observation: "current-read" as const, reviewThreadIds: new Set<string>(), failedThreadIds: new Set<string>(), queuedThreadIds: new Set<string>() };
    const aggregate = summarizeSection(section.name, sectionThreads, exact);
    // Handover count and Listening health are separate bounded facts, never
    // folded into the status. A failed read says so instead of showing zero,
    // and the handover indicator is independent of the attention observation:
    // a current attention read does not make a failed handover read available.
    const coreMeta: string[] = [];
    let listeningLabel: string | null = null;
    if (isCore && attentionState) {
      if (attentionState.handoversAwaiting === null) {
        coreMeta.push("Handovers unavailable");
      } else if (attentionState.handoversAwaiting > 0) {
        coreMeta.push(
          `${attentionState.handoversAwaiting} handover${attentionState.handoversAwaiting === 1 ? "" : "s"} waiting`,
        );
      }
      listeningLabel = listeningHealthLabel(attentionState.health);
    }
    // Unresolved attention the list cannot draw as a row (archived or absent
    // from the native feed). The heading reveals it; a hidden thread with a
    // native row opens directly, and an absent generation opens the Core.
    const revealAttention = isCore ? aggregate.revealAttention : 0;
    const listeningAction = isCore ? planListeningAction() : null;
    const revealAction = (() => {
      if (!isCore || revealAttention <= 0 || !attentionState?.attention) return null;
      const targets = reachableRevealTargets(
        attentionState.attention.entries,
        (id) => rawById.has(id),
        archivedIds,
      );
      return planAttentionReveal(targets);
    })();
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
        coreMeta={coreMeta}
        listeningLabel={listeningLabel}
        listeningTitle={listeningAction?.title}
        revealAttention={revealAttention}
        revealAttentionMore={isCore && aggregate.attentionHasMore}
        revealAttentionTitle={revealAction?.title}
        onRevealAttention={revealAction && managers.available && section.known
          ? () => {
              if (revealAction.kind === "thread") {
                navigate.toThread(revealAction.threadId);
                onNavigate();
              } else {
                void openProjectManager(section);
              }
            }
          : undefined}
        conflicted={isCore && manager ? conflictedCores.has(manager.id) : false}
        isCore={isCore}
        onReconcile={isCore && manager && conflictedCores.has(manager.id) && managers.available
          ? () => { void reconcileCore(manager.id); }
          : undefined}
        ownershipStale={isCore && manager ? managers.ownershipObservation === "stale" : false}
        moveTarget={isCore && manager ? manager.id : null}
        isMoveTarget={isCore && manager ? drag.state?.moveToProject === manager.id : false}
        managerActive={Boolean(activeThreadId && coordinatorThreadId === activeThreadId)}
        managerOpening={openingManager === section.id}
        onOpenManager={managers.available && isCore && section.known ? () => { void openProjectManager(section); } : undefined}
        onDelete={managers.available && isCore && manager
          ? () => setDeletingManager({ id: manager.id, name: section.name })
          : undefined}
        onReinitialize={managers.available && isCore && manager
          ? () => setReinitializingManager({ id: manager.id, name: section.name })
          : undefined}
        onNewThread={
          isCore
            ? undefined
            : nativeId !== null && section.known
              ? () => {
                  actions.openNewThread({ projectId: nativeId, focusPrompt: true });
                  onNavigate();
                }
              : undefined
        }
        sectionOpen={expandedProjects.ids.has(section.id)}
        onToggleProject={() => expandedProjects.toggle(section.id)}
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
      <div className="ps-project-header group/section flex shrink-0 items-center gap-1 pl-1.5 pr-2.5 pt-1">
        <ProjectChecklist
          projects={sections.filter((section) => !section.personal)}
          hiddenIds={hiddenProjects.ids}
          onVisibilityChange={(id, shown) => shown ? hiddenProjects.remove(id) : hiddenProjects.add(id)}
        />
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
        />
      </div>

      <SidebarViewSyncNotice sync={sidebarView.sync} onRetry={sidebarView.retry} className="ps-view-sync-notice" />

      {viewFiltersActive ? (
        <p
          role="status"
          className="ps-filter-note px-3 pb-1 text-2xs leading-tight text-muted-foreground/60"
        >
          Pinned and the open chat ignore the status and environment filters. Folders, pins and membership are unchanged.
        </p>
      ) : null}

      {cores.length > 0 && managers.ownershipObservation !== "current-read" ? (
        <p
          role="status"
          className="ps-ownership-status px-3 pb-1 text-2xs leading-tight text-warning-text"
        >
          {managers.ownershipObservation === "stale"
            ? "Ownership status is stale. Homes are from the last verified read; moves are paused."
            : "Ownership status is unavailable. Core homes are hidden until the manager returns."}
        </p>
      ) : null}

      {unattributed.length > 0 && managers.available ? (
        <div className="ps-unattributed-transfers px-3 pb-1">
          <button
            type="button"
            onClick={() => { void reconcileUnattributed(); }}
            title="Reconcile recorded ownership transfers that name no known source or receiver. Nothing is attributed without proof."
            className="rounded text-left text-2xs leading-tight text-warning-text underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
          >
            {unattributed.length} ownership transfer{unattributed.length === 1 ? "" : "s"} need reconciliation
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
          {movingThreadId ? <MoveToProjectDialog thread={rawById.get(movingThreadId)!} projects={cores}
            currentProjectId={coreIndex.coreByMember.get(movingThreadId) ?? null}
            onClose={() => setMovingThreadId(null)} onMove={(coreId) => moveMembership(movingThreadId, coreId)} /> : null}
          {startingProjectThreadId && rawById.get(startingProjectThreadId) ? <StartProjectFromThreadDialog
            key={startingProjectThreadId}
            thread={rawById.get(startingProjectThreadId)!}
            onClose={() => setStartingProjectThreadId(null)}
            onStarted={(threadId) => {
              setStartingProjectThreadId(null);
              void managers.refresh();
              if (threadId) { navigate.toThread(threadId); onNavigate(); }
            }} /> : null}
          {associating && rawById.get(associating.threadId) ? <AssociateToProjectDialog
            key={`${associating.threadId}:${associating.projectId ?? ""}:${associating.mode}`}
            thread={rawById.get(associating.threadId)!}
            projects={cores}
            initialProjectId={associating.projectId}
            initialMode={associating.mode}
            onClose={() => setAssociating(null)}
            onDone={(message) => {
              setAssociating(null);
              void managers.refresh();
              toast.success(message);
            }} /> : null}
          {deletingManager ? <DeleteProjectDialog
            project={deletingManager}
            onClose={() => setDeletingManager(null)}
            onDelete={() => deleteManagedProject(deletingManager.id)}
          /> : null}
          {reinitializingManager ? <ReinitializeCoreDialog
            core={reinitializingManager}
            onClose={() => setReinitializingManager(null)}
            onDone={(message) => { void managers.refresh(); toast.success(message); }} /> : null}
          {creatingProject ? <CreateNativeProjectDialog
            onClose={() => setCreatingProject(false)}
            onCreated={(project) => {
              setCreatingProject(false);
              void managers.refresh();
              toast.success(`Project ${project.name} is ready.`);
            }} /> : null}
          {folderMoveThread ? <MoveToFolderDialog
            key={folderMoveThreadId}
            thread={folderMoveThread}
            folders={chatFolders}
            currentFolderId={folderMoveCurrent}
            onClose={() => setFolderMoveThreadId(null)}
            onMove={async (destination) => {
              if (!folderMoveThreadId) return;
              let target = destination;
              if (destination !== null && destination.startsWith("new:")) {
                const created = await folderStore.create(destination.slice("new:".length));
                if (!created) throw new Error("The folder was not created.");
                target = created.id;
              }
              const result = await applyFolderMoveRef.current(folderMoveThreadId, target);
              const error = reportFolderMoveRef.current(folderMoveThreadId, target, result);
              if (error !== null) throw new Error(error);
            }} /> : null}
          {renamingFolder ? <FolderNameDialog
            folder={renamingFolder}
            onClose={() => setRenamingFolderId(null)}
            onRename={async (name) => folderStore.rename(renamingFolder.id, name)} /> : null}
          {deletingFolder ? <DeleteFolderDialog
            folder={deletingFolder}
            chatCount={deletingFolderChats}
            onClose={() => setDeletingFolderId(null)}
            onDelete={async () => {
              const removed = await folderStore.remove(deletingFolder.id);
              if (removed === null) throw new Error("The folder was not deleted.");
              setAnnouncement(`Folder ${deletingFolder.name} deleted. Its chats returned to the dated chats.`);
            }} /> : null}
          {creatingManager ? <ManagerCreate
            key={creatingManager.id}
            project={creatingManager}
            onClose={() => setCreatingManager(null)}
            onCreated={(threadId) => {
              setCreatingManager(null);
              void managers.refresh();
              navigate.toThread(threadId);
              onNavigate();
            }}
          /> : null}
          <AnimatedList as="div">
            <GroupHeading
              label="Core"
              open={!topGroupCollapsed.ids.has("core")}
              onToggle={() => topGroupCollapsed.toggle("core")}
            >
              {managers.available ? (
                <NewProjectAction
                  projects={nativeProjects}
                  onSelect={(project) => setCreatingManager({ id: project.id, name: project.name })}
                />
              ) : null}
            </GroupHeading>
            {!topGroupCollapsed.ids.has("core")
              ? coreSectionsVisible.map((section) => renderSection(section))
              : null}
            <GroupHeading
              label="Projects"
              open={!topGroupCollapsed.ids.has("projects")}
              onToggle={() => topGroupCollapsed.toggle("projects")}
              onCreate={() => setCreatingProject(true)}
              createLabel="New Project"
            />
            {!topGroupCollapsed.ids.has("projects")
              ? nativeSectionsVisible.map((section) => renderSection(section))
              : null}
            <GroupHeading
              label="Chats"
              open={!topGroupCollapsed.ids.has("chats")}
              onToggle={() => topGroupCollapsed.toggle("chats")}
              onCreate={onNewThread}
              createLabel="New chat"
            />
            {!topGroupCollapsed.ids.has("chats")
              ? chatSectionsVisible.map((section) => renderSection(section))
              : null}
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
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onCreate?: (() => void) | undefined;
  createLabel?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="group/section mt-2 first:mt-0 flex items-center gap-1 pl-3 pr-1.5 pt-1">
      <button
        type="button"
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-6 min-w-0 items-center gap-1 rounded py-0.5 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
      >
        <Icon name={open ? "ChevronDown" : "ChevronRight"} className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      <span aria-hidden className="min-w-0 flex-1" />
      {children}
      {onCreate ? (
        <button
          type="button"
          aria-label={createLabel ?? `New ${label}`}
          title={createLabel ?? `New ${label}`}
          onClick={onCreate}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:size-9 max-md:pointer-coarse:opacity-100"
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
  onNewThread,
  canDragProject,
  isDragging,
  dropPlacement,
  onHeadingDragStart,
  onOpenManager,
  onDelete,
  onReinitialize,
  onReconcile,
  managerActive,
  managerOpening,
  status,
  statusLabel,
  coreMeta,
  listeningLabel,
  listeningTitle,
  revealAttention,
  revealAttentionMore,
  revealAttentionTitle,
  onRevealAttention,
  conflicted,
  ownershipStale,
  isCore,
  moveTarget,
  isMoveTarget,
}: {
  section: ProjectSectionData;
  onOpenManager?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onReinitialize?: (() => void) | undefined;
  onReconcile?: (() => void) | undefined;
  status?: ThreadStatusKind | null;
  statusLabel?: string | undefined;
  /** Separate handover facts, rendered below the Core heading. */
  coreMeta?: readonly string[] | undefined;
  /** The one-line Listening health label, or null when there is none. */
  listeningLabel?: string | null | undefined;
  /** What the Listening action actually opens, stated truthfully. */
  listeningTitle?: string | undefined;
  /** Count of archived/absent unresolved attention the heading can reveal. */
  revealAttention?: number | undefined;
  /** True when the bounded attention list was truncated (more exist). */
  revealAttentionMore?: boolean | undefined;
  /** What the reveal action actually opens, stated truthfully. */
  revealAttentionTitle?: string | undefined;
  /** Opens a hidden unresolved thread, or the Core when none is reachable. */
  onRevealAttention?: (() => void) | undefined;
  conflicted?: boolean;
  /** The verified ownership read is stale; home is retained, moves pause. */
  ownershipStale?: boolean;
  /** True for a Core section; native Project sections keep their own copy. */
  isCore?: boolean;
  moveTarget: string | null;
  isMoveTarget: boolean;
  managerActive: boolean;
  managerOpening: boolean;
  ctx: TreeContext;
  sectionOpen: boolean;
  onToggleProject: () => void;
  onNewThread?: (() => void) | undefined;
  canDragProject: boolean;
  isDragging: boolean;
  dropPlacement: DropPlacement | null;
  onHeadingDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  // Presentation-only: keep the project's active conversations visible and
  // preview a few inactive ones. The count reflects whole conversations, and
  // the whole set stays one click away. Hooks run before the standalone branch
  // so the section can sit in the same list without changing hook order.
  const [showAllConversations, setShowAllConversations] = useState(false);
  const conversationPlan = useMemo(
    () =>
      section.personal
        ? { visible: new Set<string>(), hidden: new Set<string>(), hiddenConversations: 0 }
        : planConversations(section, {
            hiddenGroupIds: ctx.coordinatorIds,
            activeThreadId: ctx.activeThreadId,
          }),
    [ctx.activeThreadId, ctx.coordinatorIds, section],
  );
  const revealedConversations = useMemo(
    () =>
      showAllConversations
        ? new Set([...conversationPlan.visible, ...conversationPlan.hidden])
        : conversationPlan.visible,
    [conversationPlan, showAllConversations],
  );
  // Collapsing a project returns it to the bounded preview, so reopening it
  // never silently dumps every historical conversation.
  useEffect(() => {
    if (!sectionOpen) setShowAllConversations(false);
  }, [sectionOpen]);

  if (section.personal) {
    return (
      <section aria-label="Standalone chats" data-membership-target="standalone" className="mt-2 first:mt-0 min-h-8">
        <ShelfList section={section} shelf="active" ctx={ctx} grouped />
      </section>
    );
  }
  const displayState = glyphStateForStatus(status ?? "idle");
  // Collapsing a project whose conversation is selected keeps just that
  // selected path visible, without touching the stored expansion preference.
  // Navigating away (or opening the Core) drops it automatically.
  const exceptionIds = useMemo(
    () => new Set(activePathIds(section, ctx.activeThreadId, ctx.coordinatorIds)),
    [section, ctx.activeThreadId, ctx.coordinatorIds],
  );
  const showCollapsedSelection = !sectionOpen && exceptionIds.size > 0;
  // The label names the resolved status; the glyph is its resting mark.
  const activityLabel = statusLabel ?? ACTIVITY_LABELS[displayState];
  const disclosureLabel = sectionOpen
    ? `Collapse ${section.name}`
    : `Expand ${section.name}`;
  // The Core heading's secondary facts. Listening opens the Core (the SDK has
  // no cross-plugin view route), stated truthfully; the reveal opens a hidden
  // native thread directly, else the Core. Handover text is a plain fact.
  const metaNodes: ReactNode[] = [];
  if (ownershipStale) metaNodes.push("Ownership status stale; moves are paused.");
  for (const item of coreMeta ?? []) metaNodes.push(item);
  if (listeningLabel != null) {
    metaNodes.push(
      onOpenManager ? (
        <button
          key="listening"
          type="button"
          title={listeningTitle ?? "Open the Core"}
          onClick={onOpenManager}
          className="rounded text-left underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
        >
          {listeningLabel}
        </button>
      ) : (
        listeningLabel
      ),
    );
  }
  if ((revealAttention ?? 0) > 0 || revealAttentionMore) {
    const label = `${revealAttention ?? 0}${revealAttentionMore ? "+" : ""} unresolved`;
    const reveal = onRevealAttention ?? onOpenManager;
    metaNodes.push(
      reveal ? (
        <button
          key="reveal"
          type="button"
          title={revealAttentionTitle ?? "Open the Core for unresolved work"}
          onClick={reveal}
          className="rounded text-left underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
        >
          {label}
        </button>
      ) : (
        label
      ),
    );
  }
  return (
    <section
      data-membership-target={moveTarget ?? undefined}
      data-membership-over={isMoveTarget || undefined}
      aria-label={section.name}
      data-dragging={isDragging ? "true" : undefined}
      className={cn(
        "mt-0 first:mt-0 transition-opacity duration-150 ease-out motion-reduce:transition-none",
        sectionOpen && "[&+section]:mt-2",
        isDragging && "opacity-50",
        isMoveTarget && "rounded bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      <SidebarActions label={section.name} onHold={onToggleProject} actions={[
        { label: sectionOpen ? "Collapse children" : "Expand children", run: onToggleProject },
        ...(onOpenManager ? [{ label: "Open Core", run: onOpenManager }] : []),
        ...(onNewThread ? [{ label: isCore ? "New thread" : "New chat", run: onNewThread }] : []),
        ...(onReconcile ? [{ label: "Reconcile ownership transfer", run: onReconcile }] : []),
        ...(onReinitialize ? [{ label: "Reinitialize Core", run: onReinitialize }] : []),
        ...(onDelete ? [{ label: "Delete Core", run: onDelete, destructive: true }] : []),
      ]}>
      <div
        data-reorder-id={canDragProject ? section.id : undefined}
        data-reorder-kind={canDragProject ? "project" : undefined}
        onPointerDown={canDragProject ? onHeadingDragStart : undefined}
        className={cn(
          "group/heading relative flex min-h-7 items-center gap-0 rounded-md py-0.5 pl-3 pr-1 transition-colors max-md:pointer-coarse:min-h-11",
          sectionOpen && "mb-0.5",
          managerActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60",
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
        {/* The name keeps the section edge; the status slot sits to its left in
            a fixed box so the title never shifts, and the disclosure sits to
            the name's right so hover/focus reveal never moves the title. */}
        <span className="ps-status-slot flex w-4 shrink-0 items-center justify-center">
          <ProjectStatusGlyph state={displayState} label={activityLabel} />
        </span>
        <button
          type="button"
          title={onOpenManager ? `Open ${section.name}` : section.name}
          aria-description="Opens the Core. Double-click to expand or collapse children. Hold, swipe left, the Actions control or Shift+F10 also work."
          aria-current={managerActive ? "page" : undefined}
          aria-busy={managerOpening || undefined}
          onClick={(event) => {
            if (ctx.consumeSuppressedClick(section.id)) return;
            if (onOpenManager) {
              onOpenManager();
              return;
            }
            // Groups without a Project Manager keep click-to-toggle. Ignore the
            // second click of a double click so click+click nets one toggle.
            if (event.detail <= 1) onToggleProject();
          }}
          onDoubleClick={onOpenManager ? () => onToggleProject() : undefined}
          className="flex min-h-5 min-w-0 shrink items-center rounded py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
        >
          <span className={cn("ps-project-name min-w-0 truncate text-sm font-normal text-sidebar-foreground/85", managerActive && "text-sidebar-accent-foreground")}>
            {section.name}
            {section.known ? null : (
              <span className="text-muted-foreground/50"> (unknown)</span>
            )}
          </span>
        </button>
        {conflicted ? (
          <span
            role="img"
            aria-label="Ownership transfer unresolved"
            title="An ownership transfer for this Core is unresolved. The list shows the observed state."
            className="flex size-4 shrink-0 items-center justify-center text-warning-text"
          >
            <Icon name="AlertTriangle" className="size-3.5" />
          </span>
        ) : null}
        {/* Expansion is its own accessible action, directly after the name. */}
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
            "ps-project-disclosure flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
            "max-md:pointer-coarse:size-9",
            "opacity-0 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 focus-visible:opacity-100 max-md:pointer-coarse:opacity-100",
          )}
        >
          <Icon name={sectionOpen ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
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
              "ps-project-new flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
              "max-md:pointer-coarse:size-9",
              "opacity-0 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 focus-visible:opacity-100 max-md:pointer-coarse:opacity-100",
            )}
          >
            <Icon name="Plus" className="size-3.5 max-md:pointer-coarse:size-5" />
          </button>
        ) : null}
      </div>

      </SidebarActions>

      {isCore && metaNodes.length > 0 ? (
        <p className="ps-core-meta px-3 pb-0.5 text-2xs leading-tight text-muted-foreground/55" role="status">
          {metaNodes.map((node, index) => (
            <span key={index}>
              {index > 0 ? " · " : ""}
              {node}
            </span>
          ))}
        </p>
      ) : null}

      {showCollapsedSelection ? (
        <ShelfList
          section={section}
          shelf="active"
          ctx={ctx}
          grouped={!isCore}
          keepIds={exceptionIds}
          expandIds={exceptionIds}
        />
      ) : !sectionOpen ? null : conversationPlan.visible.size === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground/70">No threads</p>
      ) : (
        <ShelfList
          section={section}
          shelf="active"
          ctx={ctx}
          grouped={!isCore}
          keepIds={revealedConversations}
          trailing={
            conversationPlan.hiddenConversations > 0 ? (
              <button
                type="button"
                aria-expanded={showAllConversations}
                onClick={() => setShowAllConversations((current) => !current)}
                className="ps-more-conversations flex min-h-7 w-full items-center rounded py-0.5 pl-3 pr-2 text-left text-2xs text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
              >
                <span aria-hidden className="shrink-0" style={{ width: TREE_CHILD_INDENT }} />
                <span className="truncate">
                  {showAllConversations
                    ? "Show fewer"
                    : `Show more (${conversationPlan.hiddenConversations})`}
                </span>
              </button>
            ) : undefined
          }
        />
      )}

    </section>
  );
}
