import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Keep in step with the `.cs-drawer` transition in app.css. */
const DRAWER_MS = 110;

/**
 * The open and close for a heading's contents: the block grows and shrinks its
 * height like a drawer instead of appearing in one frame. Content mounts a
 * frame before the open so the growth can animate, and unmounts after the close
 * so a collapsed tree keeps no hidden rows mounted.
 */
export function Drawer({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = setTimeout(() => setExpanded(true), 16);
      return () => clearTimeout(frame);
    }
    setExpanded(false);
    const timer = setTimeout(() => setMounted(false), DRAWER_MS);
    return () => clearTimeout(timer);
  }, [open]);
  if (!mounted) return null;
  return (
    <div className={cn("cs-drawer", className)} data-open={expanded ? "true" : "false"}>
      <div className="cs-drawer-body">{children}</div>
    </div>
  );
}
