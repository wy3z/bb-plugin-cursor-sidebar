import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

/**
 * A per-thread dot. Colour comes from the thread's id so the same thread keeps
 * the same colour everywhere it appears, and every hue is a rotation of one
 * accent, so a custom palette still applies.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 *
 * `thread` is null for the "and more" disc in a cluster.
 */
export function Disc({
  thread,
  className,
}: {
  thread: PluginSidebarThread | null;
  className?: string;
}) {
  const hue = thread === null ? 0 : hashHue(thread.id);
  return (
    <span
      className={cn(
        "inline-block size-3.5 shrink-0 rounded-full border border-background",
        className,
      )}
      style={{
        backgroundColor:
          thread === null
            ? "var(--muted-foreground)"
            : `oklch(0.72 0.13 ${hue})`,
      }}
    />
  );
}

export function hashHue(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360;
  }
  return hash;
}
