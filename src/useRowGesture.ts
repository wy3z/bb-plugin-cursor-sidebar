import { useEffect, useRef, useState, type HTMLAttributes } from "react";

/**
 * Touch swipe thresholds reused from the Inbox sidebar card: a horizontal
 * lock past 12px, commit at 72px, clamp at 110px, so the gesture feels
 * identical across sidebars. Only the bound actions differ (Pin/Archive
 * here; never Inbox Settle/Snooze).
 */
export const ROW_SWIPE_ACTIVATE_PX = 72;
export const ROW_SWIPE_CLAMP_PX = 110;
/**
 * One slop for the whole touch. Past it the gesture is a scroll or a swipe and
 * the hold is cancelled in the same breath, so there is no zone where the hold
 * dies and nothing takes over. It doubles as the hold's drift tolerance: a
 * still finger holds, a moving one swipes.
 */
const ROW_TOUCH_SLOP_PX = 8;
/** Release below the commit threshold eases back over this long. */
const ROW_SWIPE_SETTLE_MS = 220;
/**
 * Two-stage touch hold. A short hold arms a reorder, so holding then dragging
 * moves the row; only a long hold with no movement opens the menu. Kept well
 * apart so a paused drag never turns into a menu.
 */
const ROW_REORDER_ARM_MS = 250;
const ROW_MENU_HOLD_MS = 650;

/** Touch swipe actions for one row. Present means the swipe is armed. */
export interface RowSwipeBinding {
  /** Label revealed under a left swipe (Archive on thread rows). */
  leftLabel: string;
  /** Runs on a committed left swipe; the same call as the menu action. */
  onSwipeLeft: () => void;
  /** Label revealed under a right swipe (Pin or Unpin); omitted arms left only. */
  rightLabel?: string;
  /** Runs on a committed right swipe; the same call as the menu action. */
  onSwipeRight?: () => void;
}

export interface RowSwipeState {
  /** Current horizontal offset in px, clamped; 0 at rest. */
  offset: number;
  /** True while the row is easing back to rest after an uncommitted release. */
  settling: boolean;
  /** Last non-zero side, kept through the settle so the reveal stays put. */
  direction: -1 | 0 | 1;
}

/**
 * One gesture state for touch hold, swipe, and menu on a sidebar row.
 *
 * Touch hold owns expansion; scrolling always wins before recognition. A
 * locked horizontal swipe owns the touch instead: it reveals the bound
 * action under the row, commits past the activation threshold on release,
 * and never opens the menu, so hold and swipe cannot double-fire. A release
 * short of the threshold eases the row back instead of snapping it. Reorder
 * is untouched: it engages only on deliberate mouse drags, and swipe tracks
 * touch/pen pointers only. Desktop pointers change nothing.
 */
export function useRowGesture(
  onHold: () => void,
  onMenu: () => void,
  swipe?: RowSwipeBinding,
  /**
   * Touch long-press reorder. It is offered after a short hold, and only takes
   * the touch once the finger moves; a still long-press keeps its menu.
   */
  onReorderStart?: (pointerId: number, clientX: number, clientY: number) => boolean,
): {
  gesture: HTMLAttributes<HTMLElement>;
  swipeState: RowSwipeState | null;
} {
  const callbacks = useRef({ onHold, onMenu });
  callbacks.current = { onHold, onMenu };
  const swipeRef = useRef(swipe);
  swipeRef.current = swipe;
  const cancel = useRef<(() => void) | null>(null);
  const suppressUntil = useRef(0);
  const lastTouch = useRef(0);
  const [swipeState, setSwipeState] = useState<RowSwipeState | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSettle = () => {
    if (settleTimer.current !== null) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  };
  useEffect(
    () => () => {
      cancel.current?.();
      clearSettle();
    },
    [],
  );
  return {
    gesture: {
      ...(swipe !== undefined ? { style: { touchAction: "pan-y" } } : {}),
      onPointerDown(event) {
        if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
        cancel.current?.();
        if (!event.isPrimary) { suppressUntil.current = Date.now() + 1200; return; }
        if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true], [data-row-action]")) return;
        event.stopPropagation(); // Keep native split/drawer drags from also claiming this row.
        suppressUntil.current = 0;
        lastTouch.current = Date.now();
        const binding = swipeRef.current;
        // Swipes never start on a button: the chevron and hover actions keep
        // their taps, and portals/menu buttons never arm a row swipe.
        const swipeArmed =
          binding !== undefined &&
          !(event.target as HTMLElement).closest("button");
        const { pointerId, clientX, clientY } = event;
        let recognized = false;
        let moved = false;
        let dx = 0;
        let dy = 0;
        let swipeLocked = false;
        const suppress = () => { suppressUntil.current = Date.now() + 1200; };
        let curX = clientX;
        let curY = clientY;
        // A shorter hold than the menu only ARMS a reorder. If the finger then
        // moves, the reorder takes the touch; if it stays still, the hold below
        // still opens the menu, so a long-press never loses its menu.
        let reorderArmed = false;
        const armTimer = onReorderStart === undefined ? null : setTimeout(() => {
          if (recognized || moved || swipeLocked) return;
          reorderArmed = true;
        }, ROW_REORDER_ARM_MS);
        const timer = setTimeout(() => {
          // Only a still finger holds: if the touch has already started to
          // move or swipe, the hold must not fire and open the menu.
          if (moved || swipeLocked) return;
          recognized = true;
          suppress();
          callbacks.current.onHold();
        }, ROW_MENU_HOLD_MS);
        const resetSwipe = (animate: boolean) => {
          swipeLocked = false;
          clearSettle();
          if (!animate) { setSwipeState(null); return; }
          setSwipeState((prev) => ({
            offset: 0,
            settling: true,
            direction: prev?.direction ?? 0,
          }));
          settleTimer.current = setTimeout(() => {
            settleTimer.current = null;
            setSwipeState((prev) =>
              prev !== null && prev.settling ? { ...prev, settling: false } : prev,
            );
          }, ROW_SWIPE_SETTLE_MS);
        };
        const cleanup = () => {
          clearTimeout(timer);
          if (armTimer !== null) clearTimeout(armTimer);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", abort);
          window.removeEventListener("pointerdown", additional);
          window.removeEventListener("scroll", scroll, true);
          window.removeEventListener("blur", scroll);
          cancel.current = null;
        };
        const scroll = () => { moved = true; suppress(); resetSwipe(false); cleanup(); };
        const additional = (e: PointerEvent) => { if (e.pointerId !== pointerId) scroll(); };
        const move = (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          curX = e.clientX;
          curY = e.clientY;
          // A recognized hold owns the gesture: later movement can neither
          // arm a swipe nor reopen the menu, so hold and swipe never combine.
          if (recognized) return;
          dx = e.clientX - clientX; dy = e.clientY - clientY;
          // Armed by the short hold: a vertical move hands the touch to the
          // reorder, while a horizontal one is still the swipe, so a slow swipe
          // never turns into a reorder.
          if (reorderArmed && Math.hypot(dx, dy) >= ROW_TOUCH_SLOP_PX) {
            if (Math.abs(dy) > Math.abs(dx)) {
              reorderArmed = false;
              recognized = true;
              suppress();
              onReorderStart?.(pointerId, curX, curY);
              cleanup();
              return;
            }
            reorderArmed = false;
          }
          if (!swipeLocked) {
            // Below the slop the finger is still a candidate hold. Its tiny
            // drift is tolerated so a steady hold can open the menu.
            if (Math.hypot(dx, dy) < ROW_TOUCH_SLOP_PX) return;
            // Past the slop the touch is a scroll or a swipe; the hold dies
            // here, so no movement leaves the gesture dead.
            clearTimeout(timer);
            if (Math.abs(dy) >= Math.abs(dx)) {
              scroll();
              return;
            }
            if (!swipeArmed) {
              moved = true;
              suppress();
              return;
            }
            swipeLocked = true;
          }
          if (swipeLocked) {
            suppress();
            const offset = Math.max(-ROW_SWIPE_CLAMP_PX, Math.min(ROW_SWIPE_CLAMP_PX, dx));
            setSwipeState({
              offset,
              settling: false,
              direction: offset < 0 ? -1 : offset > 0 ? 1 : 0,
            });
          }
        };
        const up = (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          // The hold already fired: consume the release with no swipe and
          // no menu, and suppress the tap that follows it.
          if (recognized) {
            suppress();
            cleanup();
            return;
          }
          if (swipeLocked) {
            const bindingNow = swipeRef.current;
            const offset = Math.max(-ROW_SWIPE_CLAMP_PX, Math.min(ROW_SWIPE_CLAMP_PX, dx));
            suppress();
            cleanup();
            const commitLeft = offset <= -ROW_SWIPE_ACTIVATE_PX;
            const commitRight = offset >= ROW_SWIPE_ACTIVATE_PX;
            const commits = bindingNow !== undefined && (commitLeft || commitRight);
            // A commit removes the row, so it leaves at once; anything short
            // of it eases back under the finger.
            resetSwipe(!commits);
            if (commits && bindingNow !== undefined) {
              if (commitLeft) bindingNow.onSwipeLeft();
              else bindingNow.onSwipeRight?.();
            }
            return;
          }
          if (recognized || moved) suppress();
          cleanup();
          if (!recognized && dx < -48 && Math.abs(dx) > Math.abs(dy) * 1.5) callbacks.current.onMenu();
        };
        const abort = (e: PointerEvent) => { if (e.pointerId === pointerId) scroll(); };
        window.addEventListener("pointermove", move, { passive: true });
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", abort);
        window.addEventListener("pointerdown", additional);
        window.addEventListener("scroll", scroll, true);
        window.addEventListener("blur", scroll);
        cancel.current = () => { resetSwipe(false); cleanup(); };
      },
      onClickCapture(event) {
        if (event.detail !== 0 && Date.now() < suppressUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onContextMenu(event) {
        if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
        event.preventDefault();
        event.stopPropagation();
        // Native touch contextmenu must not race the hold timer or undo a scroll cancellation.
        if (Date.now() - lastTouch.current < 2000) return;
        callbacks.current.onMenu();
      },
      onKeyDown(event) {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          event.stopPropagation();
          callbacks.current.onMenu();
        }
      },
    },
    swipeState: swipe === undefined ? null : swipeState,
  };
}
