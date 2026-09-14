import { useEffect, useRef, type HTMLAttributes } from "react";

/** Touch hold owns expansion; scrolling always wins before recognition. */
export function useRowGesture(onHold: () => void, onMenu: () => void): HTMLAttributes<HTMLElement> {
  const callbacks = useRef({ onHold, onMenu });
  callbacks.current = { onHold, onMenu };
  const cancel = useRef<(() => void) | null>(null);
  const suppressUntil = useRef(0);
  const lastTouch = useRef(0);
  useEffect(() => () => cancel.current?.(), []);
  return {
    onPointerDown(event) {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      cancel.current?.();
      if (!event.isPrimary) { suppressUntil.current = Date.now() + 1200; return; }
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true], [data-row-action]")) return;
      event.stopPropagation(); // Keep native split/drawer drags from also claiming this row.
      suppressUntil.current = 0;
      lastTouch.current = Date.now();
      const { pointerId, clientX, clientY } = event;
      let recognized = false;
      let moved = false;
      let dx = 0;
      let dy = 0;
      const suppress = () => { suppressUntil.current = Date.now() + 1200; };
      const timer = setTimeout(() => {
        recognized = true;
        suppress();
        callbacks.current.onHold();
      }, 550);
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", abort);
        window.removeEventListener("pointerdown", additional);
        window.removeEventListener("scroll", scroll, true);
        window.removeEventListener("blur", scroll);
        if (cancel.current === cleanup) cancel.current = null;
      };
      const scroll = () => { moved = true; suppress(); cleanup(); };
      const additional = (e: PointerEvent) => { if (e.pointerId !== pointerId) scroll(); };
      const move = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        dx = e.clientX - clientX; dy = e.clientY - clientY;
        if (Math.hypot(dx, dy) > 10) {
          moved = true;
          clearTimeout(timer);
          suppress();
        }
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
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
  };
}
