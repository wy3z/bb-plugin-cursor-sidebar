import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import type { IconName } from "@/components/ui/icon";
import { holdListScroll, releaseListScroll } from "./scroll-lock";

/**
 * Touch swipe thresholds reused from the Inbox sidebar card: commit at 72px,
 * clamp at 110px, so the gesture feels identical across sidebars. Only the
 * bound actions differ (Pin/Archive here; never Inbox Settle/Snooze).
 */
export const ROW_SWIPE_ACTIVATE_PX = 72;
export const ROW_SWIPE_CLAMP_PX = 110;
/**
 * The dead zone before the axis is decided, and the lead a vertical move needs
 * before it is treated as a scroll. A thumb never travels straight, so a bare
 * "whichever grew faster" test on the first few pixels turns a swipe into a
 * scroll; the swipe takes any lead at all, and only a clearly vertical move
 * gets the touch for the list.
 */
const ROW_AXIS_LOCK_PX = 10;
const ROW_SCROLL_RATIO = 1.4;
/** Past this drift a lifted finger is dragging rather than holding. */
const ROW_TOUCH_SLOP_PX = 8;
/** Release below the commit threshold eases back over this long. */
const ROW_SWIPE_SETTLE_MS = 220;
/**
 * Two-stage touch hold. A short hold lifts the row, so holding then dragging
 * moves it; `ROW_MENU_HOLD_MS` only serves rows that cannot be dragged at all,
 * because a lifted row waits for the release instead of firing its menu while
 * the finger is still deciding.
 */
const ROW_REORDER_ARM_MS = 300;
const ROW_MENU_HOLD_MS = 650;
/** The click that follows a gesture is swallowed for this long. */
const ROW_SUPPRESS_MS = 600;

/** One side of a row swipe: what it says, what it draws, what it runs. */
export interface RowSwipeSide {
  label: string;
  icon: IconName;
  /** Removes something, so it reads in the destructive tone. */
  destructive?: boolean;
  run: () => void;
}

/** Touch swipe actions for one row. Present means the swipe is armed. */
export interface RowSwipeBinding {
  /** Revealed by a swipe towards the end of the row. */
  left?: RowSwipeSide;
  /** Revealed by a swipe the other way. */
  right?: RowSwipeSide;
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
 * locked horizontal swipe owns the touch instead: it reveals the bound action
 * under the row, commits past the activation threshold on release, and never
 * opens the menu, so hold and swipe cannot double-fire. A release short of the
 * threshold eases the row back instead of snapping it. Reorder is untouched: it
 * engages only on deliberate mouse drags, and swipe tracks touch/pen pointers
 * only. Desktop pointers change nothing.
 */
export function useRowGesture(
  onHold: () => void,
  onMenu: () => void,
  swipe?: RowSwipeBinding,
  /**
   * Touch long-press reorder. A hold lifts the row; the finger then either
   * moves, which hands it to the drag, or comes up, which keeps the hold's own
   * meaning. Returns nothing, so a drag can only start when one is offered.
   */
  onReorderStart?: (pointerId: number, clientX: number, clientY: number) => boolean,
): {
  gesture: HTMLAttributes<HTMLElement>;
  swipeState: RowSwipeState | null;
  /** True while a touch hold has lifted the row for a drag. */
  reorderArmed: boolean;
} {
  const callbacks = useRef({ onHold, onMenu });
  callbacks.current = { onHold, onMenu };
  const swipeRef = useRef(swipe);
  swipeRef.current = swipe;
  const cancel = useRef<(() => void) | null>(null);
  const suppressUntil = useRef(0);
  const lastTouch = useRef(0);
  const [swipeState, setSwipeState] = useState<RowSwipeState | null>(null);
  const [reorderArmed, setReorderArmed] = useState(false);
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
        if (!event.isPrimary) { suppressUntil.current = Date.now() + ROW_SUPPRESS_MS; return; }
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
        // The scroller is found from the row while the row is still where the
        // finger left it, so a drag can hold the list still from here on.
        const surface = event.currentTarget as HTMLElement;
        let scrollHeld = false;
        let recognized = false;
        let moved = false;
        let lifted = false;
        let dx = 0;
        let dy = 0;
        let swipeLocked = false;
        const suppress = () => { suppressUntil.current = Date.now() + ROW_SUPPRESS_MS; };
        let curX = clientX;
        let curY = clientY;
        const armTimer = onReorderStart === undefined ? null : setTimeout(() => {
          if (recognized || moved || swipeLocked) return;
          lifted = true;
          setReorderArmed(true);
          // Nothing may pan while the row is lifted, or the drag is over before
          // the finger has moved anywhere.
          if (!scrollHeld) scrollHeld = holdListScroll(surface);
          // The lift is the whole signal that the press became a drag; a short
          // buzz is the same signal on a device that cannot show it well.
          navigator.vibrate?.(10);
        }, ROW_REORDER_ARM_MS);
        const timer = setTimeout(() => {
          // Only a still finger holds, and only where no lift was offered: a
          // lifted row has already told the finger it can be moved.
          if (moved || swipeLocked || lifted) return;
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
          window.removeEventListener("touchmove", touchMove);
          if (scrollHeld) { scrollHeld = false; releaseListScroll(); }
          setReorderArmed(false);
          cancel.current = null;
        };
        const clampOffset = (value: number) =>
          Math.max(-ROW_SWIPE_CLAMP_PX, Math.min(ROW_SWIPE_CLAMP_PX, value));
        const showSwipe = (offset: number) => {
          const direction = offset < 0 ? -1 : offset > 0 ? 1 : 0;
          // Past the clamp the offset stops changing, so keep the same state
          // object and skip the render.
          setSwipeState((prev) =>
            prev !== null && prev.offset === offset && !prev.settling &&
            prev.direction === direction
              ? prev
              : { offset, settling: false, direction },
          );
        };
        /**
         * One sample of the finger, taken from the pointer stream and from the
         * raw touch stream. Deciding the axis here, and claiming the touch with
         * `preventDefault` the moment it becomes a swipe or a drag, is what
         * stops the browser panning the list out from under the gesture and
         * cancelling the pointer with it.
         */
        const sample = (x: number, y: number, touchEvent?: TouchEvent) => {
          if (recognized) return;
          curX = x;
          curY = y;
          dx = x - clientX;
          dy = y - clientY;
          const distance = Math.hypot(dx, dy);
          if (swipeLocked) {
            touchEvent?.preventDefault();
            suppress();
            showSwipe(clampOffset(dx));
            return;
          }
          // A lifted row takes any real movement, in any direction: the finger
          // was told it could move, and a heading has no swipe to lose.
          if (lifted && distance >= ROW_TOUCH_SLOP_PX) {
            touchEvent?.preventDefault();
            recognized = true;
            suppress();
            // The drag takes its own hold on the scroll before this one lets
            // go, so the list is never briefly pannable mid-gesture.
            onReorderStart?.(pointerId, curX, curY);
            cleanup();
            return;
          }
          // Inside the dead zone the press is still a hold and its drift is
          // tolerated, so a steady finger keeps its menu.
          if (distance < ROW_AXIS_LOCK_PX) return;
          clearTimeout(timer);
          const horizontal = Math.abs(dx);
          const vertical = Math.abs(dy);
          // The swipe is the gesture with no second chance: once the list takes
          // the touch, that touch cannot be swiped any more. So the swipe takes
          // any horizontal lead, and only a clearly vertical move scrolls.
          const leading = horizontal >= vertical
            ? "swipe"
            : vertical >= horizontal * ROW_SCROLL_RATIO
              ? "scroll"
              : null;
          // A thumb that stays in between has not decided; take the dominant
          // axis once it has travelled far enough to mean something.
          const axis = leading ?? (distance >= ROW_AXIS_LOCK_PX * 2
            ? (horizontal >= vertical ? "swipe" : "scroll")
            : null);
          if (axis === null) return;
          // Past the dead zone the hold dies in the same breath as the
          // decision, so no movement leaves the gesture dead.
          if (axis === "scroll") {
            moved = true;
            suppress();
            resetSwipe(false);
            cleanup();
            return;
          }
          if (!swipeArmed) {
            moved = true;
            suppress();
            return;
          }
          // A side with nothing bound is not a swipe: the row stays where it is
          // rather than sliding to reveal an action that does not exist.
          if ((dx < 0 ? binding?.left : binding?.right) === undefined) {
            moved = true;
            suppress();
            return;
          }
          swipeLocked = true;
          touchEvent?.preventDefault();
          if (!scrollHeld) scrollHeld = holdListScroll(surface);
          suppress();
          clearSettle();
          showSwipe(clampOffset(dx));
        };
        /**
         * The touch stream, not the pointer stream: `pointermove` cannot cancel
         * a scroll, so this is the listener that can claim the touch before the
         * browser turns it into a pan.
         */
        const touchMove = (touchEvent: TouchEvent) => {
          const touch = touchEvent.touches[0];
          if (touch === undefined) return;
          sample(touch.clientX, touch.clientY, touchEvent);
        };
        const scroll = () => { moved = true; suppress(); resetSwipe(false); cleanup(); };
        const additional = (e: PointerEvent) => { if (e.pointerId !== pointerId) scroll(); };
        const move = (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          sample(e.clientX, e.clientY);
        };
        const up = (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          // The row was lifted and the finger never moved, so the press keeps
          // its hold meaning: fold a project, expand a family, or open the
          // actions menu where there is no hold action.
          if (lifted && !recognized && !moved && !swipeLocked) {
            suppress();
            cleanup();
            callbacks.current.onHold();
            return;
          }
          // The hold already fired: consume the release with no swipe and
          // no menu, and suppress the tap that follows it.
          if (recognized) {
            suppress();
            cleanup();
            return;
          }
          if (swipeLocked) {
            const bindingNow = swipeRef.current;
            const offset = clampOffset(dx);
            suppress();
            cleanup();
            const side = offset <= -ROW_SWIPE_ACTIVATE_PX
              ? bindingNow?.left
              : offset >= ROW_SWIPE_ACTIVATE_PX
                ? bindingNow?.right
                : undefined;
            // A commit removes or moves the row, so it leaves at once; anything
            // short of the threshold eases back under the finger.
            resetSwipe(side === undefined);
            side?.run();
            return;
          }
          if (recognized || moved) suppress();
          cleanup();
          if (!recognized && dx < -48 && Math.abs(dx) > Math.abs(dy) * 1.5) callbacks.current.onMenu();
        };
        /**
         * A cancelled pointer is the browser taking the touch for a pan. Mid
         * swipe that is not a reason to snap the row back: the finger is still
         * down and the release is still to come, so the swipe keeps its offset
         * and commits or eases back from here.
         */
        const abort = (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          if (swipeLocked) { up(e); return; }
          scroll();
        };
        window.addEventListener("pointermove", move, { passive: true });
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", abort);
        window.addEventListener("pointerdown", additional);
        window.addEventListener("scroll", scroll, true);
        window.addEventListener("blur", scroll);
        window.addEventListener("touchmove", touchMove, { passive: false });
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
    reorderArmed,
  };
}
