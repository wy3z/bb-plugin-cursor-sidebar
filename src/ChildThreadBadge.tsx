import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Disc } from "./Disc";

/**
 * Inbox's overlapping child dots, count and disclosure marker. The actual
 * toggle lives in the left gutter so it stays usable when hover actions show.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */
export function ChildThreadBadge({
  threads,
  expanded,
}: {
  threads: readonly PluginSidebarThread[];
  expanded: boolean;
}) {
  const visible = threads.filter((thread) => !thread.isArchived);
  const needsYou = visible.filter((thread) => thread.hasPendingInteraction).length;
  const countLabel = `${visible.length} child ${visible.length === 1 ? "thread" : "threads"}`;

  return (
    <span
      aria-hidden
      title={`${countLabel}${needsYou > 0 ? `, ${needsYou} need you` : ""}`}
      className={cn(
        "flex h-4 shrink-0 items-center gap-0.5 px-1 text-[10px] font-medium leading-none",
        needsYou > 0
          ? "text-[#c9791b] dark:text-amber-300"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="flex shrink-0 items-center">
        {visible.slice(0, 3).map((thread, index) => (
          <span key={thread.id} data-child-thread-dot="" className={cn("flex", index > 0 && "-ml-1")}>
            <Disc thread={thread} className="size-2.5 border border-sidebar" />
          </span>
        ))}
      </span>
      <span className="whitespace-nowrap text-[9px] font-normal tabular-nums opacity-70">{visible.length}</span>
      <Icon
        name={expanded ? "ChevronUp" : "ChevronDown"}
        className="size-3"
        aria-hidden
      />
    </span>
  );
}
