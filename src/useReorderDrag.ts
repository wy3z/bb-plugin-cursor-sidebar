import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { moveId, type DropPlacement } from "./thread-order";
import { UNFILED_GROUP_KEY } from "./standalone-groups";

export interface ReorderDragState {
  kind: "project" | "thread";
  /**
   * Standalone folder drop: a native section id to file the dragged family,
   * null to unfile it back to the dated chats. Undefined means no folder
   * change. Never reassigns project membership.
   */
  moveToSection?: string | null;
  /** Pin change for the dragged family. Undefined means no pin change. */
  pin?: boolean;
  /** Owning section for a thread drag; empty for projects. */
  sectionId: string;
  /** The scope a thread drag is constrained to; empty for projects. */
  scope: string;
  movingId: string;
  ids: string[];
  /** The row the pointer is over, for a visible placement indicator. */
  overId: string | null;
  placement: DropPlacement | null;
  /** The folder or pin header under the pointer, for its highlight. */
  overTarget: string | null;
  /**
   * The thread under the pointer's center band: dropping there reparents the
   * dragged thread under it. Null means a reorder or filing drop instead.
   */
  parentTargetId: string | null;
}

export interface ReorderDrag {
  state: ReorderDragState | null;
  /** A click that followed an engaged drag should be swallowed. */
  consumeSuppressedClick: (id: string) => boolean;
  startProject: (
    event: ReactPointerEvent<HTMLElement>,
    ids: readonly string[],
    movingId: string,
    label?: string,
  ) => void;
  startThread: (
    event: ReactPointerEvent<HTMLElement>,
    sectionId: string,
    scope: string,
    ids: readonly string[],
    movingId: string,
    label?: string,
  ) => void;
  /** Touch long-press: engage a project drag for a pointer already down. */
  startProjectPickUp: (
    pointerId: number,
    clientX: number,
    clientY: number,
    ids: readonly string[],
    movingId: string,
    label?: string,
  ) => void;
  /** Touch long-press: engage a thread drag for a pointer already down. */
  startThreadPickUp: (
    pointerId: number,
    clientX: number,
    clientY: number,
    sectionId: string,
    scope: string,
    ids: readonly string[],
    movingId: string,
    label?: string,
  ) => void;
}

/** Identifiers the lifted clone must not carry: a second copy in the document
 * would double every query and reorder lookup that keys off them. */
const GHOST_STRIPPED_ATTRS = [
  "id",
  "data-reorder-id",
  "data-reorder-kind",
  "data-reorder-scope",
  "data-thread-row-id",
  "data-thread-shelf",
  "data-sidebar-thread-id",
  "data-sidebar-thread-shortcut-target",
  "data-thread-focus-id",
];

/**
 * A lifted copy of the dragged row that follows the pointer. The clone keeps
 * the row's own markup and classes, so it reads exactly like the row that was
 * picked up. It stays inside the plugin root because the utility classes are
 * scoped to that subtree, and the root has no transformed ancestor, so a fixed
 * position still tracks the viewport.
 */
function mountDragGhost(
  source: HTMLElement | null,
  label: string,
  rect: DOMRect | null,
  x: number,
  y: number,
): HTMLDivElement {
  const ghost = document.createElement("div");
  ghost.className = "cs-drag-ghost";
  ghost.setAttribute("aria-hidden", "true");
  const style = ghost.style;
  style.position = "fixed";
  style.top = "0";
  style.left = "0";
  style.boxSizing = "border-box";
  style.width = `${Math.round(rect?.width ?? 220)}px`;
  style.zIndex = "120";
  style.pointerEvents = "none";
  style.willChange = "transform";

  if (source === null) {
    ghost.textContent = label;
    style.padding = "5px 12px";
    style.borderRadius = "6px";
    style.background = "var(--sidebar, #1c1c1f)";
    style.border = "1px solid var(--border, rgba(255,255,255,0.14))";
    style.boxShadow = "0 10px 30px rgba(0,0,0,0.4)";
    style.color = "var(--sidebar-foreground, #e5e5e5)";
    style.fontSize = "13px";
    style.lineHeight = "1.4";
    style.whiteSpace = "nowrap";
    style.overflow = "hidden";
    style.textOverflow = "ellipsis";
  } else {
    const clone = source.cloneNode(true) as HTMLElement;
    for (const node of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))]) {
      for (const name of GHOST_STRIPPED_ATTRS) node.removeAttribute(name);
    }
    clone.style.width = "100%";
    ghost.appendChild(clone);
    // The row itself is transparent, so the lifted copy carries the list's own
    // surface; without it the rows underneath would show through the clone.
    ghost.style.background = "var(--sidebar, #1c1c1f)";
    ghost.style.borderRadius = "6px";
    ghost.style.opacity = "0.97";
    ghost.style.filter = "drop-shadow(0 10px 22px rgba(0,0,0,0.4))";
  }

  const host = source?.closest<HTMLElement>("[data-cursor-sidebar-root]") ?? document.body;
  host.appendChild(ghost);
  moveDragGhost(ghost, x, y);
  return ghost;
}

function moveDragGhost(ghost: HTMLDivElement, x: number, y: number): void {
  ghost.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

/**
 * Pointer drag reordering for one flat list.
 *
 * It engages only on a deliberate vertical drag. Once the pointer commits to a
 * mostly horizontal move the host's split gesture owns the interaction, so the
 * reorder is cancelled rather than waiting to engage late. It reorders the
 * supplied id list live with a visible placement target, restores the body's
 * previous user-select value, suppresses the click that follows an engaged
 * drag (including Escape and a drag that returns to its start), and removes
 * every listener and timer on unmount.
 *
 * While engaged the dragged row is lifted into a floating ghost that follows
 * the pointer; the live reorder moves the row's slot in flow, so siblings
 * slide out of the way around it.
 */
export function useReorderDrag(
  onCommit: (state: ReorderDragState) => void,
  canNest: (targetId: string, movingId: string) => boolean = () => false,
): ReorderDrag {
  const canNestRef = useRef(canNest);
  canNestRef.current = canNest;
  const [state, setState] = useState<ReorderDragState | null>(null);
  const stateRef = useRef<ReorderDragState | null>(null);
  stateRef.current = state;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const activeCancel = useRef<(() => void) | null>(null);
  const suppressedClick = useRef<string | null>(null);
  const suppressedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSuppression = useCallback(() => {
    if (suppressedTimer.current !== null) {
      clearTimeout(suppressedTimer.current);
      suppressedTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      activeCancel.current?.();
      clearSuppression();
    },
    [clearSuppression],
  );

  const suppressNextClick = useCallback((id: string) => {
    suppressedClick.current = id;
    clearSuppression();
    suppressedTimer.current = setTimeout(() => {
      if (suppressedClick.current === id) suppressedClick.current = null;
      suppressedTimer.current = null;
    }, 250);
  }, [clearSuppression]);

  const begin = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      initial: Omit<ReorderDragState, "overId" | "placement" | "overTarget" | "parentTargetId">,
      matches: (element: HTMLElement) => boolean,
      label: string,
      /**
       * Touch long-press pick-up: the drag is already engaged when this runs,
       * so the mouse-only guards are skipped and the row lifts immediately
       * under the finger that is still down.
       */
      engageNow = false,
    ) => {
      if (!engageNow && (event.button !== 0 || event.pointerType !== "mouse")) return;
      activeCancel.current?.();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      // The grabbed row's rect fixes the ghost's width and the grab point, so
      // the lift tracks the pointer the way it left the list.
      const grabbed = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-reorder-id]")
        : null;
      const grabbedRect = grabbed?.getBoundingClientRect() ?? null;
      const grabOffsetX = grabbedRect === null ? 0 : startX - grabbedRect.left;
      const grabOffsetY = grabbedRect === null ? 0 : startY - grabbedRect.top;
      let lastX = startX;
      let lastY = startY;
      let current: ReorderDragState = {
        ...initial,
        ids: [...initial.ids],
        overId: null,
        placement: null,
        overTarget: null,
        parentTargetId: null,
      };
      let currentSig = signatureOf(current);
      let engaged = false;
      let finished = false;
      const previousUserSelect = document.body.style.userSelect;
      const previousCursor = document.body.style.cursor;
      let dragCursorStyle: HTMLStyleElement | null = null;
      let ghost: HTMLDivElement | null = null;

      /**
       * A touch drag must hold the list still. `pointermove` cannot cancel a
       * scroll, so the touch moves themselves are swallowed for the drag's
       * lifetime; without this the browser pans the list and then cancels the
       * pointer, which ends the drag the moment it starts.
       */
      const preventTouchScroll = (touchEvent: TouchEvent) => {
        touchEvent.preventDefault();
      };

      // Reorder fires on many pointer moves; only a real change is a state
      // update, so React (and the sibling list animation) is not restarted
      // every frame.
      const commit = (next: ReorderDragState) => {
        const sig = signatureOf(next);
        if (sig === currentSig) return;
        currentSig = sig;
        current = next;
        stateRef.current = next;
        setState(next);
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("blur", cancel);
        document.removeEventListener("visibilitychange", cancel);
        window.removeEventListener("touchmove", preventTouchScroll);
        document.body.style.userSelect = previousUserSelect;
        if (engaged) document.body.style.cursor = previousCursor;
        dragCursorStyle?.remove();
        ghost?.remove();
        ghost = null;
        if (activeCancel.current === cancel) activeCancel.current = null;
      };
      const cancel = () => {
        if (finished) return;
        finished = true;
        cleanup();
        if (engaged) {
          suppressNextClick(current.movingId);
          setState(null);
        }
      };
      const engage = () => {
        engaged = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        // Inbox's grabbing cursor must win over links and inline-title cursors.
        dragCursorStyle = document.createElement("style");
        dragCursorStyle.dataset.cursorSidebarDragCursor = "";
        dragCursorStyle.textContent = "* { cursor: grabbing !important; }";
        document.head.appendChild(dragCursorStyle);
        window.addEventListener("touchmove", preventTouchScroll, { passive: false });
        ghost = mountDragGhost(
          grabbed,
          label,
          grabbedRect,
          lastX - grabOffsetX,
          lastY - grabOffsetY,
        );
        stateRef.current = current;
        setState(current);
      };
      const reorderAt = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        if (!(hit instanceof Element)) return;
        if (current.kind === "thread") {
          // Standalone folder and pin headers take precedence over row
          // reorder: dropping files or (un)pins the whole family instead of
          // moving it within its cluster. A folder drop also unpins, so the
          // move is visible instead of hiding behind the Pinned precedence; a
          // pin drop keeps any folder filing underneath.
          const folderTarget = hit.closest<HTMLElement>("[data-folder-target]");
          if (folderTarget?.dataset.folderTarget !== undefined) {
            const key = folderTarget.dataset.folderTarget;
            const sectionId = key === UNFILED_GROUP_KEY ? null : key;
            commit({
              ...current,
              moveToSection: sectionId,
              pin: false,
              overId: null,
              placement: null,
              overTarget: `folder:${key}`,
              parentTargetId: null,
            });
            return;
          }
          const pinTarget = hit.closest<HTMLElement>("[data-pin-target]");
          if (pinTarget?.dataset.pinTarget !== undefined) {
            const key = pinTarget.dataset.pinTarget;
            commit({
              ...current,
              pin: key === "pin",
              moveToSection: undefined,
              overId: null,
              placement: null,
              overTarget: `pin:${key}`,
              parentTargetId: null,
            });
            return;
          }
        }
        // The center band of a thread row nests the dragged thread under it;
        // the edges still reorder. A nest target may sit outside the reorder
        // scope, so it is resolved before the sibling match.
        const nestRow = hit.closest<HTMLElement>("[data-reorder-id]");
        const nestTargetId =
          nestRow !== null && nestRow.dataset.reorderKind === "thread"
            ? nestRow.dataset.reorderId
            : undefined;
        if (
          current.kind === "thread" &&
          nestRow !== null &&
          nestTargetId !== undefined &&
          nestTargetId !== current.movingId &&
          canNestRef.current(nestTargetId, current.movingId)
        ) {
          const nestRect = nestRow.getBoundingClientRect();
          const ratio = (y - nestRect.top) / nestRect.height;
          if (ratio > 0.3 && ratio < 0.7) {
            commit({
              ...current,
              parentTargetId: nestTargetId,
              overId: null,
              placement: null,
              overTarget: null,
              moveToSection: undefined,
              pin: undefined,
            });
            return;
          }
        }
        const target = hit.closest<HTMLElement>("[data-reorder-id]");
        if (target === null || !matches(target)) {
          if (current.parentTargetId !== null) {
            commit({ ...current, parentTargetId: null });
          }
          return;
        }
        const targetId = target.dataset.reorderId;
        if (
          targetId === undefined ||
          targetId === current.movingId ||
          !current.ids.includes(targetId)
        ) {
          if (current.parentTargetId !== null) {
            commit({ ...current, parentTargetId: null });
          }
          return;
        }
        const rect = target.getBoundingClientRect();
        const placement: DropPlacement =
          y < rect.top + rect.height / 2 ? "before" : "after";
        // A same-cluster row owns the drop: folder and pin intent clear so a
        // reorder never also files or (un)pins.
        commit({
          ...current,
          ids: moveId(current.ids, current.movingId, targetId, placement),
          overId: targetId,
          placement,
          moveToSection: undefined,
          pin: undefined,
          overTarget: null,
          parentTargetId: null,
        });
      };
      function onMove(moveEvent: PointerEvent) {
        if (finished || moveEvent.pointerId !== pointerId) return;
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        if (ghost !== null) {
          moveDragGhost(ghost, lastX - grabOffsetX, lastY - grabOffsetY);
        }
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!engaged) {
          // A committed horizontal move belongs to the host's split gesture;
          // stop tracking so we never engage a late vertical reorder.
          if (Math.abs(dx) > 8 && Math.abs(dx) >= Math.abs(dy)) {
            cancel();
            return;
          }
          if (Math.abs(dy) < 6 || Math.abs(dy) <= Math.abs(dx)) return;
          engage();
        }
        moveEvent.preventDefault();
        reorderAt(moveEvent.clientX, moveEvent.clientY);
      }
      function onUp(upEvent: PointerEvent) {
        if (finished || upEvent.pointerId !== pointerId) return;
        finished = true;
        const committed = stateRef.current;
        const wasEngaged = engaged;
        cleanup();
        if (!wasEngaged || committed === null) return;
        setState(null);
        suppressNextClick(committed.movingId);
        if (committed.moveToSection !== undefined || committed.pin !== undefined || committed.parentTargetId !== null || committed.ids.join("\0") !== initial.ids.join("\0")) {
          onCommitRef.current(committed);
        }
      }
      function onCancel(cancelEvent: PointerEvent) {
        if (cancelEvent.pointerId === pointerId) cancel();
      }
      function onKey(keyEvent: KeyboardEvent) {
        if (keyEvent.key === "Escape") cancel();
      }
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey);
      // Losing the window or hiding the tab loses the pointerup, so end the
      // drag here instead of leaving a ghost and a grabbing cursor behind.
      window.addEventListener("blur", cancel);
      document.addEventListener("visibilitychange", cancel);
      activeCancel.current = cancel;
      // A touch pick-up is already engaged: lift the ghost and start tracking
      // the pointer that is still down, with no movement threshold.
      if (engageNow) engage();
    },
    [suppressNextClick],
  );

  const startProject = useCallback(
    (event: ReactPointerEvent<HTMLElement>, ids: readonly string[], movingId: string, label = "") => {
      begin(
        event,
        { kind: "project", sectionId: "", scope: "", movingId, ids: [...ids] },
        (element) => element.dataset.reorderKind === "project",
        label,
      );
    },
    [begin],
  );

  const startThread = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      sectionId: string,
      scope: string,
      ids: readonly string[],
      movingId: string,
      label = "",
    ) => {
      begin(
        event,
        { kind: "thread", sectionId, scope, movingId, ids: [...ids] },
        (element) =>
          element.dataset.reorderKind === "thread" &&
          element.dataset.reorderScope === scope,
        label,
      );
    },
    [begin],
  );

  const consumeSuppressedClick = useCallback((id: string) => {
    if (suppressedClick.current !== id) return false;
    suppressedClick.current = null;
    return true;
  }, []);

  /**
   * Touch long-press pick-up for a thread: the pointer is already down, so the
   * drag engages at once from the row itself instead of an event target.
   */
  const startThreadPickUp = useCallback(
    (
      pointerId: number,
      clientX: number,
      clientY: number,
      sectionId: string,
      scope: string,
      ids: readonly string[],
      movingId: string,
      label = "",
    ) => {
      const row = document.querySelector<HTMLElement>(
        `[data-thread-row-id="${CSS.escape(movingId)}"]`,
      );
      const event = {
        button: 0,
        pointerType: "touch",
        pointerId,
        clientX,
        clientY,
        target: (row ?? document.body) as EventTarget,
      } as unknown as ReactPointerEvent<HTMLElement>;
      begin(
        event,
        { kind: "thread", sectionId, scope, movingId, ids: [...ids] },
        (element) =>
          element.dataset.reorderKind === "thread" &&
          element.dataset.reorderScope === scope,
        label,
        true,
      );
    },
    [begin],
  );

  /** Touch long-press pick-up for a project heading, the same way. */
  const startProjectPickUp = useCallback(
    (
      pointerId: number,
      clientX: number,
      clientY: number,
      ids: readonly string[],
      movingId: string,
      label = "",
    ) => {
      const heading = document.querySelector<HTMLElement>(
        `[data-reorder-kind="project"][data-reorder-id="${CSS.escape(movingId)}"]`,
      );
      const event = {
        button: 0,
        pointerType: "touch",
        pointerId,
        clientX,
        clientY,
        target: (heading ?? document.body) as EventTarget,
      } as unknown as ReactPointerEvent<HTMLElement>;
      begin(
        event,
        { kind: "project", sectionId: "", scope: "", movingId, ids: [...ids] },
        (element) => element.dataset.reorderKind === "project",
        label,
        true,
      );
    },
    [begin],
  );

  return useMemo(
    () => ({
      state,
      consumeSuppressedClick,
      startProject,
      startThread,
      startProjectPickUp,
      startThreadPickUp,
    }),
    [consumeSuppressedClick, startProject, startProjectPickUp, startThread, startThreadPickUp, state],
  );
}

/** A cheap identity for a drag state, so identical frames do not re-render. */
function signatureOf(state: ReorderDragState): string {
  return [
    state.moveToSection === null ? "\u0000x" : (state.moveToSection ?? "\u0000u"),
    state.pin ?? "\u0000u",
    state.overId ?? "\u0000n",
    state.placement ?? "\u0000n",
    state.overTarget ?? "\u0000n",
    state.parentTargetId ?? "\u0000n",
    state.ids.join("\u0001"),
  ].join("\u0002");
}
