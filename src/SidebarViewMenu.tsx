import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { ANCHORED_OVERLAY_MOTION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import type { SidebarView } from "./server";
import {
  NO_ENVIRONMENT_KEY,
  STATUS_FILTER_LABELS,
  VIEW_GROUP_BY,
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
  type ViewProjectOrder,
  type ViewStatusFilter,
} from "./sidebar-view";

export interface SidebarViewMenuTriggerProps {
  /** Whether the shown view is saved, saving, unsaved or unreadable. */
  sync: SidebarViewSync;
  /** Replaces the default toolbar trigger sizing when the menu sits on a heading. */
  triggerClassName?: string;
}

export interface SidebarViewMenuRootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  view: SidebarView;
  sync: SidebarViewSync;
  onRetry: () => void;
  onUpdate: (patch: Partial<SidebarView>) => void;
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
}

const CONTENT =
  `cs-view-menu z-50 w-max max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md ${ANCHORED_OVERLAY_MOTION}`;
const ITEM =
  "flex min-h-7 cursor-pointer select-none items-center gap-2 rounded py-1 pl-2 pr-3 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";
const OPTION =
  "relative flex min-h-7 cursor-pointer select-none items-center gap-2 rounded py-1 pl-2 pr-6 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground text-muted-foreground data-[state=checked]:text-foreground";
const SECTION_LABEL =
  "px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70";

/** The tick sits at the right edge, the way Cursor's menus do. */
function CheckMark() {
  return (
    <span className="absolute right-1.5 flex size-3.5 items-center justify-center">
      <DropdownMenu.ItemIndicator>
        <Icon name="Check" className="size-3.5 text-primary" />
      </DropdownMenu.ItemIndicator>
    </span>
  );
}

function OptionIcon({ icon }: { icon?: IconName | undefined }) {
  return icon === undefined ? null : (
    <Icon name={icon} className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
  );
}

function ChoiceItem({ value, label, icon }: { value: string; label: string; icon?: IconName }) {
  return (
    <DropdownMenu.RadioItem value={value} onSelect={(event) => event.preventDefault()} className={OPTION}>
      <CheckMark />
      <OptionIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </DropdownMenu.RadioItem>
  );
}

function ToggleItem({
  checked,
  label,
  icon,
  onToggle,
}: {
  checked: boolean;
  label: string;
  icon?: IconName;
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
      <OptionIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </DropdownMenu.CheckboxItem>
  );
}

/** A submenu row: label, its current value, then the chevron. */
function SubTrigger({ label, value }: { label: string; value?: string | undefined }) {
  return (
    <DropdownMenu.SubTrigger className={SUB_TRIGGER}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value === undefined ? null : (
        <span className="shrink-0 text-2xs text-muted-foreground/60">{value}</span>
      )}
      <Icon name="ChevronRight" className="size-3.5 shrink-0 text-muted-foreground/60" />
    </DropdownMenu.SubTrigger>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      {children}
    </DropdownMenu.Sub>
  );
}

/** The All / None pair that heads a filter submenu. */
function FilterHeader({ label, onAll, onNone }: { label: string; onAll: () => void; onNone: () => void }) {
  const className =
    "rounded px-1 text-2xs text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring";
  return (
    <div className="flex items-center justify-between px-2 py-1">
      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" onClick={onAll} className={className}>All</button>
        <button type="button" onClick={onNone} className={className}>None</button>
      </span>
    </div>
  );
}

const GROUPING_LABELS: Record<ViewGroupBy, string> = {
  workspace: "Projects",
  updated: "Updated",
  status: "Status",
  environment: "Environment",
};

const GROUPING_ICONS: Record<ViewGroupBy, IconName> = {
  workspace: "Folder",
  updated: "Clock",
  status: "Spinner",
  environment: "Cloud",
};

const STATUS_ICONS: Record<ViewStatusFilter, IconName> = {
  input: "MessageQuestion",
  failed: "CircleX",
  working: "Spinner",
  unread: "BellDot",
  idle: "Circle",
};

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
      <span className="min-w-0 max-w-56 flex-1">{notice.text}</span>
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
 * BB's theme tokens. Grouping is one radio: Projects, Updated, Status, or
 * Environment — selecting one replaces the current extra grouping; they never
 * stack. Ordering chooses how conversations, projects and group sections are
 * sorted. Radix menu primitives supply real arrow-key navigation, roving focus
 * and typeahead, so the radio and checkbox semantics work from the keyboard,
 * not from role attributes alone.
 *
 * The root and the trigger are separate pieces: the root holds the open state
 * and the menu surface, while a trigger only draws the toolbar button. The list
 * owns the root, so changing grouping, which moves the trigger to a different
 * heading, leaves the open menu in place.
 */
export function SidebarViewMenuTrigger({ sync, triggerClassName }: SidebarViewMenuTriggerProps) {
  const notice = sidebarViewSyncNotice(sync);
  return (
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        aria-label={notice === null ? "Customize sidebar view" : `Customize sidebar view. ${notice.text}`}
        title={notice === null ? "Customize" : notice.text}
        className={
          triggerClassName ??
          "flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground/55 hover:text-foreground data-[state=open]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:size-9 pointer-coarse:size-9"
        }
      >
        <Icon name="ListFilter" className="size-3.5" />
        {notice !== null ? (
          <Icon
            name={notice.tone === "warning" ? "AlertTriangle" : "CircleX"}
            className={cn("size-3.5", notice.tone === "warning" ? "text-warning-text" : "text-destructive")}
            aria-hidden="true"
          />
        ) : null}
      </button>
    </DropdownMenu.Trigger>
  );
}

export function SidebarViewMenuRoot({
  open,
  onOpenChange,
  children,
  view,
  sync,
  onRetry,
  onUpdate,
  environmentOptions,
  showNoEnvironment,
  anyCollapsed,
  onExpandAll,
  onCollapseAll,
  unreadOrdinaryCount,
  markReadBusy,
  onMarkAllRead,
}: SidebarViewMenuRootProps) {
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
  const statusFilterValue =
    view.statusFilter.length === VIEW_STATUS_FILTERS.length
      ? "All"
      : `${view.statusFilter.length} selected`;
  const environmentFilterValue = (() => {
    if (view.environmentFilter === null) return "All";
    if (view.environmentFilter.length === 1) {
      const only = view.environmentFilter[0]!;
      if (only === NO_ENVIRONMENT_KEY) return "No environment";
      return environmentOptions.find((environment) => environment.id === only)?.label ?? "1 selected";
    }
    return `${view.environmentFilter.length} selected`;
  })();

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      {children}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...scope}
          align="start"
          sideOffset={4}
          className={CONTENT}
          // Selecting a grouping moves the trigger to another heading, which
          // unmounts the focused button. Without this the menu would close on
          // that focus change; Escape, a click outside, or picking an action
          // still closes it.
          onFocusOutside={(event) => event.preventDefault()}
        >
          {notice !== null ? <SidebarViewSyncNotice sync={sync} onRetry={onRetry} /> : null}
          <Section>
            <SubTrigger label="Grouping" value={GROUPING_LABELS[view.groupBy]} />
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                <DropdownMenu.RadioGroup
                  value={view.groupBy}
                  onValueChange={(value) => onUpdate({ groupBy: value as ViewGroupBy })}
                >
                  {VIEW_GROUP_BY.map((groupBy) => (
                    <ChoiceItem
                      key={groupBy}
                      value={groupBy}
                      label={GROUPING_LABELS[groupBy]}
                      icon={GROUPING_ICONS[groupBy]}
                    />
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </Section>

          <Section>
            <SubTrigger label="Ordering" />
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                <DropdownMenu.Label className={SECTION_LABEL}>
                  Chats
                </DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  value={view.sortConversationsBy}
                  onValueChange={(value) =>
                    onUpdate({ sortConversationsBy: value as ViewConversationOrder })
                  }
                >
                  <ChoiceItem value="updated" label="Updated" icon="Clock" />
                  <ChoiceItem value="status" label="Status" icon="Spinner" />
                </DropdownMenu.RadioGroup>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                {view.groupBy === "workspace" ? (
                  <>
                    <DropdownMenu.Label className={SECTION_LABEL}>
                      Projects
                    </DropdownMenu.Label>
                    <DropdownMenu.RadioGroup
                      value={view.sortProjectsBy}
                      onValueChange={(value) =>
                        onUpdate({ sortProjectsBy: value as ViewProjectOrder })
                      }
                    >
                      <ChoiceItem value="manual" label="Manual" icon="ArrowUpDown" />
                      <ChoiceItem value="status" label="Status" icon="Spinner" />
                    </DropdownMenu.RadioGroup>
                  </>
                ) : (
                  <>
                    <DropdownMenu.Label className={SECTION_LABEL}>
                      Groups
                    </DropdownMenu.Label>
                    <DropdownMenu.RadioGroup
                      value={view.sortGroupsBy}
                      onValueChange={(value) =>
                        onUpdate({ sortGroupsBy: value as "manual" | "updated" })
                      }
                    >
                      <ChoiceItem value="updated" label="Updated" icon="Clock" />
                      {/* "manual" is the persisted default; no drag writes a
                          group order, so it reads as the canonical one. */}
                      <ChoiceItem value="manual" label="Default" icon="ArrowUpDown" />
                    </DropdownMenu.RadioGroup>
                  </>
                )}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </Section>

          <Section>
            <SubTrigger label="Show" />
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                <ToggleItem checked={view.show.updated} label="Updated time" icon="Clock" onToggle={(next) => onUpdate({ show: { ...view.show, updated: next } })} />
                <ToggleItem checked={view.show.environment} label="Environment" icon="Cloud" onToggle={(next) => onUpdate({ show: { ...view.show, environment: next } })} />
                <ToggleItem checked={view.show.branch} label="Branch" icon="GitBranch" onToggle={(next) => onUpdate({ show: { ...view.show, branch: next } })} />
                <ToggleItem checked={view.show.host} label="Machine" icon="Monitor" onToggle={(next) => onUpdate({ show: { ...view.show, host: next } })} />
                <ToggleItem checked={view.show.pr} label="Pull request" icon="GitPullRequest" onToggle={(next) => onUpdate({ show: { ...view.show, pr: next } })} />
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </Section>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Label className={SECTION_LABEL}>Filters</DropdownMenu.Label>
          <Section>
            <SubTrigger label="Status" value={statusFilterValue} />
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                <FilterHeader
                  label="Status"
                  onAll={() => setAllStatuses(true)}
                  onNone={() => setAllStatuses(false)}
                />
                {VIEW_STATUS_FILTERS.map((status) => (
                  <ToggleItem
                    key={status}
                    checked={view.statusFilter.includes(status)}
                    label={STATUS_FILTER_LABELS[status]}
                    icon={STATUS_ICONS[status]}
                    onToggle={(next) => toggleStatus(status, next)}
                  />
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </Section>

          {environmentOptions.length > 0 || showNoEnvironment ? (
            <Section>
              <SubTrigger label="Environment" value={environmentFilterValue} />
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent {...scope} sideOffset={4} alignOffset={-4} className={CONTENT}>
                  <FilterHeader
                    label="Environment"
                    onAll={() => setAllEnvironments(true)}
                    onNone={() => setAllEnvironments(false)}
                  />
                  {environmentOptions.map((environment) => (
                    <ToggleItem
                      key={environment.id}
                      checked={environmentSelected(environment.id)}
                      label={environment.label}
                      icon="Cloud"
                      onToggle={(next) => toggleEnvironment(environment.id, next)}
                    />
                  ))}
                  {showNoEnvironment ? (
                    <ToggleItem
                      checked={environmentSelected(NO_ENVIRONMENT_KEY)}
                      label="No environment"
                      icon="CloudOff"
                      onToggle={(next) => toggleEnvironment(NO_ENVIRONMENT_KEY, next)}
                    />
                  ) : null}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </Section>
          ) : null}

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
            {markReadBusy ? "Marking as read…" : "Mark All as Read"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
