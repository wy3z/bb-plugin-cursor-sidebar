import { useCallback, useRef, type ReactNode } from "react";
import { autoAnimate } from "./vendor/auto-animate/index.mjs";

/** Inbox Sidebar's list animation and timing, reused for every sibling list.
 * Derived from bb-plugin-thread-inbox (MIT); see THIRD-PARTY-NOTICES.md.
 */

/** How long a row, or a whole project, takes to slide out of the way. Slower
 * than a UI transition on purpose: a project can travel most of the viewport
 * height, and a move that finishes in a sixth of a second reads as a jump. The
 * curve leaves at once and spends its time settling, so a drag that keeps
 * crossing rows glides instead of snapping. Adds and removes share the
 * duration (an add runs 1.5x it), so a row entering a list moves at the same
 * tempo as the rows making room for it. */
const MOVE_MS = 240;
const MOVE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/** A list whose direct children slide when they are added, removed or
 * reordered. Only the immediate children of this node animate, so every list
 * needs its own: a `Drawer` body full of sections is not one. */
export function AnimatedList({
  as: Tag = "ul",
  children,
  className,
}: {
  as?: "ul" | "div";
  children: ReactNode;
  className?: string;
}) {
  const controller = useRef<ReturnType<typeof autoAnimate> | null>(null);
  const attach = useCallback((node: HTMLElement | null) => {
    controller.current?.destroy?.();
    controller.current?.disable();
    controller.current = null;
    if (
      !node ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    controller.current = autoAnimate(node, { duration: MOVE_MS, easing: MOVE_EASING });
  }, []);
  return <Tag ref={attach} className={className}>{children}</Tag>;
}
