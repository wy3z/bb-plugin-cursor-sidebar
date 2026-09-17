import { useEffect, useRef, useState, type HTMLAttributes } from "react";

/**
 * Touch swipe thresholds reused from the Inbox sidebar card: a horizontal
 * lock past 12px, commit at 72px, clamp at 110px, so the gesture feels
 * identical across sidebars. Only the bound actions differ (Pin/Archive
 * here; never Inbox Settle/Snooze).
 */
export const ROW_SWIPE_ACTIVATE_PX = 72;
export const ROW_SWIPE_CLAMP_PX = 110;
const ROW_SWIPE_LOCK_PX = 12;
const ROW_SWIPE_VERTICAL_PX = 8;

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
}

/**
 * One gesture state for touch hold, swipe, and menu on a sidebar row.
 *
 * Touch hold owns expansion; scrolling always wins before recognition. A
 * locked horizontal swipe owns the touch instead: it reveals the bound
 * action under the row, commits past the activation threshold on release,
 * and never opens the menu, so hold and swipe cannot double-fire. Reorder
 * is untouched: it engages only on deliberate mouse drags, and swipe tracks
 * touch/pen pointers only. Desktop pointers change nothing.
 */
export function useRowGesture(
  onHold: () => void,
  onMenu: () => void,
  swipe?: RowSwipeBinding,
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
  const [swipeOffset, setSwipeOffset] = useState(0);
  useEffect(() => () => cancel.current?.(), []);
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
        const timer = setTimeout(() => {
          recognized = true;
          suppress();
          callbacks.current.onHold();
        }, 550);
        const resetSwipe = () => {
          swipeLocked = false;
          setSwipeOffset(0);
        };
        const cleanup = () => {
          clearTimeout(timer);
          resetSwipe();
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", abort);
          window.removeEventListener("pointerdown", additional);
          window.removeEventListener("scroll", scroll, true);
          window.removeEventListener("blur", scroll);
          if (cancel.current === cleanup) cancel.current = null;
        };
        const scroll = () => { moved = true; suppress(); resetSwipe(); cleanup(); };
        const additional = (e: PointerEvent) => { if (e.pointerId !== pointerId) scroll(); };
        const move = (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          // A recognized hold owns the gesture: later movement can neither
          // arm a swipe nor reopen the menu, so hold and swipe never combine.
          if (recognized) return;
          dx = e.clientX - clientX; dy = e.clientY - clientY;
          if (!swipeLocked && swipeArmed) {
            // Direction lock: vertical wins early and the browser scrolls;
            // horizontal past the lock owns the touch for the swipe. A
            // vertical take-over cancels exactly like a scroll, so the
            // release tap can never open the row mid-scroll.
            if (Math.abs(dy) > ROW_SWIPE_VERTICAL_PX && Math.abs(dy) >= Math.abs(dx)) {
              scroll();
              return;
            }
            if (Math.abs(dx) >= ROW_SWIPE_LOCK_PX && Math.abs(dx) >= Math.abs(dy) * 1.5) {
              swipeLocked = true;
            }
          }
          if (swipeLocked) {
            dx = e.clientX - clientX; dy = e.clientY - clientY;
            clearTimeout(timer);
            suppress();
            setSwipeOffset(Math.max(-ROW_SWIPE_CLAMP_PX, Math.min(ROW_SWIPE_CLAMP_PX, dx)));
            return;
          }
          if (Math.hypot(dx, dy) > 10) {
            moved = true;
            clearTimeout(timer);
            suppress();
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
            resetSwipe();
            cleanup();
            if (bindingNow !== undefined) {
              if (offset <= -ROW_SWIPE_ACTIVATE_PX) bindingNow.onSwipeLeft();
              else if (offset >= ROW_SWIPE_ACTIVATE_PX) bindingNow.onSwipeRight?.();
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
        cancel.current = cleanup;
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
    swipeState: swipe === undefined ? null : { offset: swipeOffset },
  };
}
