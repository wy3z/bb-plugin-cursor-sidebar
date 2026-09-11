import { useCallback, useRef, type ReactNode } from "react";
import { autoAnimate } from "./vendor/auto-animate/index.mjs";

/** Inbox Sidebar's list animation and timing, reused for every sibling list.
 * Derived from bb-plugin-thread-inbox (MIT); see THIRD-PARTY-NOTICES.md.
 */
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
    controller.current = autoAnimate(node, { duration: 150, easing: "ease-out" });
  }, []);
  return <Tag ref={attach} className={className}>{children}</Tag>;
}
