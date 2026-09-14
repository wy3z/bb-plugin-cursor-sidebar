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
  moveToProject?: string | null;
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
}

export interface ReorderDrag {
  state: ReorderDragState | null;
  /** A click that followed an engaged drag should be swallowed. */
  consumeSuppressedClick: (id: string) => boolean;
  startProject: (
    event: ReactPointerEvent<HTMLElement>,
    ids: readonly string[],
    movingId: string,
  ) => void;
  startThread: (
    event: ReactPointerEvent<HTMLElement>,
    sectionId: string,
    scope: string,
    ids: readonly string[],
    movingId: string,
  ) => void;
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
 */
export function useReorderDrag(
  onCommit: (state: ReorderDragState) => void,
  canMove: (threadId: string) => boolean = () => false,
): ReorderDrag {
  const canMoveRef = useRef(canMove);
  canMoveRef.current = canMove;
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
      initial: Omit<ReorderDragState, "overId" | "placement" | "overTarget">,
      matches: (element: HTMLElement) => boolean,
    ) => {
      if (event.button !== 0 || event.pointerType === "touch") return;
      activeCancel.current?.();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let current: ReorderDragState = {
        ...initial,
        ids: [...initial.ids],
        overId: null,
        placement: null,
        overTarget: null,
      };
      let engaged = false;
      let finished = false;
      const previousUserSelect = document.body.style.userSelect;
      const previousCursor = document.body.style.cursor;
      let dragCursorStyle: HTMLStyleElement | null = null;

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        document.body.style.userSelect = previousUserSelect;
        if (engaged) document.body.style.cursor = previousCursor;
        dragCursorStyle?.remove();
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
        dragCursorStyle.dataset.projectSidebarDragCursor = "";
        dragCursorStyle.textContent = "* { cursor: grabbing !important; }";
        document.head.appendChild(dragCursorStyle);
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
            current = {
              ...current,
              moveToSection: sectionId,
              pin: false,
              moveToProject: undefined,
              overId: null,
              placement: null,
              overTarget: `folder:${key}`,
            };
            stateRef.current = current; setState(current); return;
          }
          const pinTarget = hit.closest<HTMLElement>("[data-pin-target]");
          if (pinTarget?.dataset.pinTarget !== undefined) {
            const key = pinTarget.dataset.pinTarget;
            current = {
              ...current,
              pin: key === "pin",
              moveToSection: undefined,
              moveToProject: undefined,
              overId: null,
              placement: null,
              overTarget: `pin:${key}`,
            };
            stateRef.current = current; setState(current); return;
          }
        }
        const destination = hit.closest<HTMLElement>("[data-membership-target]");
        if (current.kind === "thread" && destination && canMoveRef.current(current.movingId)) {
          const targetId = destination.dataset.membershipTarget;
          if (targetId && current.sectionId !== (targetId === "standalone" ? "standalone-chats" : `managed:${targetId}`)) {
            current = { ...current, moveToProject: targetId === "standalone" ? null : targetId, moveToSection: undefined, pin: undefined, overId: null, placement: null, overTarget: null };
            stateRef.current = current; setState(current); return;
          }
        }
        if (current.moveToProject !== undefined) {
          current = { ...current, moveToProject: undefined }; stateRef.current = current; setState(current);
        }
        const target = hit.closest<HTMLElement>("[data-reorder-id]");
        if (target === null || !matches(target)) return;
        const targetId = target.dataset.reorderId;
        if (
          targetId === undefined ||
          targetId === current.movingId ||
          !current.ids.includes(targetId)
        ) {
          return;
        }
        const rect = target.getBoundingClientRect();
        const placement: DropPlacement =
          y < rect.top + rect.height / 2 ? "before" : "after";
        const ids = moveId(current.ids, current.movingId, targetId, placement);
        // A same-cluster row owns the drop: folder and pin intent clear so a
        // reorder never also files or (un)pins.
        current = { ...current, ids, overId: targetId, placement, moveToSection: undefined, pin: undefined, overTarget: null };
        stateRef.current = current;
        setState(current);
      };
      function onMove(moveEvent: PointerEvent) {
        if (finished || moveEvent.pointerId !== pointerId) return;
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
        if (committed.moveToProject !== undefined || committed.moveToSection !== undefined || committed.pin !== undefined || committed.ids.join("\0") !== initial.ids.join("\0")) {
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
      activeCancel.current = cancel;
    },
    [suppressNextClick],
  );

  const startProject = useCallback(
    (event: ReactPointerEvent<HTMLElement>, ids: readonly string[], movingId: string) => {
      begin(
        event,
        { kind: "project", sectionId: "", scope: "", movingId, ids: [...ids] },
        (element) => element.dataset.reorderKind === "project",
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
      ) => {
      begin(
        event,
        { kind: "thread", sectionId, scope, movingId, ids: [...ids] },
        (element) =>
          element.dataset.reorderKind === "thread" &&
          element.dataset.reorderScope === scope,
      );
    },
    [begin],
  );

  const consumeSuppressedClick = useCallback((id: string) => {
    if (suppressedClick.current !== id) return false;
    suppressedClick.current = null;
    return true;
  }, []);

  return useMemo(
    () => ({ state, consumeSuppressedClick, startProject, startThread }),
    [consumeSuppressedClick, startProject, startThread, state],
  );
}
