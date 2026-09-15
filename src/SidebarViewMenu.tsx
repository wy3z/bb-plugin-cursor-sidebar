import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import type { SidebarView } from "./server";
import {
  NO_ENVIRONMENT_KEY,
  STATUS_FILTER_LABELS,
  VIEW_STATUS_FILTERS,
  allEnvironmentFilterPatch,
  allStatusFilterPatch,
  environmentFilterPatch,
  sidebarViewSyncNotice,
  statusFilterPatch,
  type EnvironmentIdentity,
  type SidebarViewSync,
  type ViewConversationOrder,
  type ViewGroupBy,
  type ViewStatusFilter,
} from "./sidebar-view";

export interface SidebarViewMenuProps {
  view: SidebarView;
  /** Whether the shown view is saved, saving, unsaved or unreadable. */
  sync: SidebarViewSync;
  onRetry: () => void;
  onUpdate: (patch: Partial<SidebarView>) => void;
  onReset: () => void;
  /** Environments present in the loaded ordinary conversations. */
  environmentOptions: readonly EnvironmentIdentity[];
  /** True when a loaded ordinary conversation has no environment. */
  showNoEnvironment: boolean;
  /** Every collapsible target in the controlled scope, for the bulk toggle. */
  anyCollapsed: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** Unread ordinary conversations the bulk read covers. */
  unreadOrdinaryCount: number;
  markReadBusy: boolean;
  onMarkAllRead: () => void;
  /** Replaces the default toolbar trigger sizing when the menu sits on a heading. */
  triggerClassName?: string;
}

const CONTENT =
  "ps-view-menu z-50 min-w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md";
const ITEM =
  "flex min-h-7 cursor-pointer select-none items-center gap-2 rounded px-2 py-1 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";
const OPTION =
  "relative flex min-h-7 cursor-pointer select-none items-center gap-2 rounded py-1 pl-6 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground text-muted-foreground data-[state=checked]:text-foreground";

function CheckMark() {
  return (
    <span className="absolute left-1.5 flex size-3.5 items-center justify-center">
      <DropdownMenu.ItemIndicator>
        <Icon name="Check" className="size-3.5 text-primary" />
      </DropdownMenu.ItemIndicator>
    </span>
  );
}

function ChoiceItem({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <DropdownMenu.RadioItem value={value} onSelect={(event) => event.preventDefault()} className={OPTION}>
      <CheckMark />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-2xs text-muted-foreground/60">{hint}</span> : null}
    </DropdownMenu.RadioItem>
  );
}

function ToggleItem({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <DropdownMenu.CheckboxItem
      checked={checked}
      onCheckedChange={onToggle}
      onSelect={(event) => event.preventDefault()}
      className={OPTION}
    >
      <CheckMark />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </DropdownMenu.CheckboxItem>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      {children}
    </DropdownMenu.Sub>
  );
}

const SUB_TRIGGER = cn(
  ITEM,
  "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
);

/**
 * The persistent feedback for a save or read failure, with one bounded retry.
 * It stays until a later successful write clears it, so a recovery read never
 * makes an unsaved choice look saved.
 */
export function SidebarViewSyncNotice({
  sync,
  onRetry,
  className,
}: {
  sync: SidebarViewSync;
  onRetry: () => void;
  className?: string;
}) {
  const notice = sidebarViewSyncNotice(sync);
  if (notice === null) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-1.5 px-3 pb-1 text-2xs leading-tight",
        notice.tone === "warning" ? "text-warning-text" : "text-destructive",
        className,
      )}
    >
      <Icon
        name={notice.tone === "warning" ? "AlertTriangle" : "CircleX"}
        className="mt-px size-3 shrink-0"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
      >
        Retry
      </button>
    </div>
  );
}

/**
 * The compact view menu. It mirrors Cursor's organization as submenus
 * (Grouping, Ordering, Show, Filters) over the one persisted SidebarView, using
 * BB's theme tokens. Radix menu primitives supply real arrow-key navigation,
 * roving focus and typeahead, so the radio and checkbox semantics work from the
 * keyboard, not from role attributes alone.
 */
export function SidebarViewMenu({
  view,
  sync,
  onRetry,
  onUpdate,
  onReset,
  environmentOptions,
  showNoEnvironment,
  anyCollapsed,
  onExpandAll,
  onCollapseAll,
  unreadOrdinaryCount,
  markReadBusy,
  onMarkAllRead,
  triggerClassName,
}: SidebarViewMenuProps) {
  const scope = usePortalScopeProps();
  const notice = sidebarViewSyncNotice(sync);
  const environmentKeys = [
    ...environmentOptions.map((environment) => environment.id),
    ...(showNoEnvironment ? [NO_ENVIRONMENT_KEY] : []),
  ];
  const toggleStatus = (status: ViewStatusFilter, on: boolean) =>
    onUpdate(statusFilterPatch(view, status, on));
  const setAllStatuses = (on: boolean) => onUpdate(allStatusFilterPatch(on));
  const environmentSelected = (id: string) =>
    view.environmentFilter === null || view.environmentFilter.includes(id);
  const toggleEnvironment = (id: string, on: boolean) =>
    onUpdate(environmentFilterPatch(view, id, environmentKeys, on));
  const setAllEnvironments = (on: boolean) => onUpdate(allEnvironmentFilterPatch(on));

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={notice === null ? "Customize sidebar view" : `Customize sidebar view. ${notice.text}`}
          title={notice === null ? "Customize" : notice.text}
          className={
            triggerClassName ??
            "flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground/55 hover:text-foreground data-[state=open]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:size-9"
          }
        >
          <Icon name="SlidersHorizontal" className="size-3.5" />
          {notice !== null ? (
            <Icon
              name={notice.tone === "warning" ? "AlertTriangle" : "CircleX"}
              className={cn("size-3.5", notice.tone === "warning" ? "text-warning-text" : "text-destructive")}
              aria-hidden="true"
            />
          ) : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...scope}
          align="start"
          sideOffset={4}
          className={CONTENT}
        >
          {notice !== null ? <SidebarViewSyncNotice sync={sync} onRetry={onRetry} /> : null}
          <Section>
            <DropdownMenu.SubTrigger className={SUB_TRIGGER}>
              <span className="min-w-0 flex-1 truncate">Grouping</span>
              <Icon name="ChevronRight" className="size-3.5 shrink-0 text-muted-foreground/60" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                <DropdownMenu.RadioGroup
                  value={view.groupBy}
                  onValueChange={(value) => onUpdate({ groupBy: value as ViewGroupBy })}
                >
                  <ChoiceItem value="updated" label="Updated" hint="default" />
                  <ChoiceItem value="workspace" label="No extra grouping" />
                  <ChoiceItem value="status" label="Status" />
                  <ChoiceItem value="environment" label="Environment" />
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </Section>

          <Section>
            <DropdownMenu.SubTrigger className={SUB_TRIGGER}>
              <span className="min-w-0 flex-1 truncate">Ordering</span>
              <Icon name="ChevronRight" className="size-3.5 shrink-0 text-muted-foreground/60" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                <DropdownMenu.Label className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Conversations
                </DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  value={view.sortConversationsBy}
                  onValueChange={(value) =>
                    onUpdate({ sortConversationsBy: value as ViewConversationOrder })
                  }
                >
                  <ChoiceItem value="manual" label="Manual" hint="default" />
                  <ChoiceItem value="updated" label="Updated" />
                  <ChoiceItem value="status" label="Status" />
                </DropdownMenu.RadioGroup>
                {view.groupBy !== "workspace" ? (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Label className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Groups
                    </DropdownMenu.Label>
                    <DropdownMenu.RadioGroup
                      value={view.sortGroupsBy}
                      onValueChange={(value) =>
                        onUpdate({ sortGroupsBy: value as "manual" | "updated" })
                      }
                    >
                      <ChoiceItem value="manual" label="Default order" />
                      <ChoiceItem value="updated" label="Most recent" />
                    </DropdownMenu.RadioGroup>
                  </>
                ) : null}
                {view.sortConversationsBy !== "manual" ? (
                  <DropdownMenu.Label className="px-2 py-1 text-2xs leading-tight text-muted-foreground/60">
                    Manual reorder is off while an automatic conversation order is selected.
                  </DropdownMenu.Label>
                ) : null}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </Section>

          <Section>
            <DropdownMenu.SubTrigger className={SUB_TRIGGER}>
              <span className="min-w-0 flex-1 truncate">Show</span>
              <Icon name="ChevronRight" className="size-3.5 shrink-0 text-muted-foreground/60" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                <ToggleItem checked={view.show.updated} label="Updated time" onToggle={(next) => onUpdate({ show: { ...view.show, updated: next } })} />
                <ToggleItem checked={view.show.environment} label="Environment" onToggle={(next) => onUpdate({ show: { ...view.show, environment: next } })} />
                <ToggleItem checked={view.show.branch} label="Branch" onToggle={(next) => onUpdate({ show: { ...view.show, branch: next } })} />
                <ToggleItem checked={view.show.host} label="Machine" onToggle={(next) => onUpdate({ show: { ...view.show, host: next } })} />
                <ToggleItem checked={view.show.pr} label="Pull request" onToggle={(next) => onUpdate({ show: { ...view.show, pr: next } })} />
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </Section>

          <Section>
            <DropdownMenu.SubTrigger className={SUB_TRIGGER}>
              <span className="min-w-0 flex-1 truncate">Filters</span>
              <Icon name="ChevronRight" className="size-3.5 shrink-0 text-muted-foreground/60" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">Status</span>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setAllStatuses(true)} className="rounded px-1 text-2xs text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring">All</button>
                    <button type="button" onClick={() => setAllStatuses(false)} className="rounded px-1 text-2xs text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring">None</button>
                  </span>
                </div>
                {VIEW_STATUS_FILTERS.map((status) => (
                  <ToggleItem
                    key={status}
                    checked={view.statusFilter.includes(status)}
                    label={STATUS_FILTER_LABELS[status]}
                    onToggle={(next) => toggleStatus(status, next)}
                  />
                ))}
                {environmentOptions.length > 0 || showNoEnvironment ? (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">Environment</span>
                      <span className="flex items-center gap-1">
                        <button type="button" onClick={() => setAllEnvironments(true)} className="rounded px-1 text-2xs text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring">All</button>
                        <button type="button" onClick={() => setAllEnvironments(false)} className="rounded px-1 text-2xs text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring">None</button>
                      </span>
                    </div>
                    {environmentOptions.map((environment) => (
                      <ToggleItem
                        key={environment.id}
                        checked={environmentSelected(environment.id)}
                        label={environment.label}
                        onToggle={(next) => toggleEnvironment(environment.id, next)}
                      />
                    ))}
                    {showNoEnvironment ? (
                      <ToggleItem
                        checked={environmentSelected(NO_ENVIRONMENT_KEY)}
                        label="No environment"
                        onToggle={(next) => toggleEnvironment(NO_ENVIRONMENT_KEY, next)}
                      />
                    ) : null}
                  </>
                ) : null}
                <DropdownMenu.Label className="px-2 py-1 text-2xs leading-tight text-muted-foreground/60">
                  Pinned and the open chat stay visible; filters never change folders, pins or membership.
                </DropdownMenu.Label>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </Section>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className={ITEM}
            onSelect={() => (anyCollapsed ? onExpandAll() : onCollapseAll())}
          >
            {anyCollapsed ? "Expand All" : "Collapse All"}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={ITEM}
            disabled={markReadBusy || unreadOrdinaryCount === 0}
            onSelect={() => onMarkAllRead()}
          >
            {markReadBusy ? "Marking as read…" : `Mark all ${unreadOrdinaryCount} unread as read`}
          </DropdownMenu.Item>
          <DropdownMenu.Label className="px-2 pb-1 text-2xs leading-tight text-muted-foreground/60">
            Read covers loaded ordinary chats. Managed work is never accepted.
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className={cn(ITEM, "text-destructive data-[highlighted]:text-destructive")}
            onSelect={() => onReset()}
          >
            Reset view
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
