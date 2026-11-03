import { useMemo } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { SidebarView } from "./server";
import { ordinaryThreadStatus, VIEW_STATUS_FILTERS, type ViewStatusFilter } from "./sidebar-view";

type SidebarViewPatch = Partial<SidebarView>;

const CHIPS: readonly { key: "all" | ViewStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "working", label: "Working" },
  { key: "input", label: "Needs input" },
  { key: "unread", label: "Unread" },
];

/**
 * Phone-only status filter row. Each chip writes the same `statusFilter` the
 * view menu's Status filter writes, so the two stay in step. Hidden on
 * fine-pointer desktop by `app.css`.
 */
export function MobileStatusChips({
  threads,
  view,
  onUpdate,
}: {
  threads: readonly PluginSidebarThread[];
  view: SidebarView;
  onUpdate: (patch: SidebarViewPatch) => void;
}) {
  const counts = useMemo(() => {
    const next: Record<ViewStatusFilter, number> = { input: 0, failed: 0, working: 0, unread: 0, idle: 0 };
    for (const thread of threads) next[ordinaryThreadStatus(thread)] += 1;
    return next;
  }, [threads]);
  const showsAll = view.statusFilter.length === VIEW_STATUS_FILTERS.length;
  const only = view.statusFilter.length === 1 ? view.statusFilter[0] : null;

  return (
    <div role="toolbar" aria-label="Filter chats by status" className="cs-mobile-chips hidden">
      {CHIPS.map((chip) => {
        const active = chip.key === "all" ? showsAll : only === chip.key;
        const count = chip.key === "all" ? threads.length : counts[chip.key];
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={active}
            data-empty={count === 0 ? "true" : undefined}
            onClick={() =>
              onUpdate({
                statusFilter:
                  chip.key === "all" || active ? [...VIEW_STATUS_FILTERS] : [chip.key],
              })
            }
            className={cn("cs-chip", active && "cs-chip-on")}
          >
            {chip.label}
            <span className="cs-chip-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
