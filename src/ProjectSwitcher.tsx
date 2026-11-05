import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import type { ProjectIcon } from "./project-icons";
import { ProjectIconMark } from "./ProjectIconMark";
import { NO_PROJECT_KEY, type ProjectIdentity } from "./sidebar-view";
import { VIEW_MENU_CONTENT, VIEW_MENU_ITEM } from "./SidebarViewMenu";

/** The value of the "All projects" row; no project id is ever this. */
const ALL_PROJECTS = "__all_projects__";
/** A radio value no row carries, for a multi-project filter. */
const MULTIPLE_PROJECTS = "__multiple_projects__";

/**
 * The toolbar row's left control: a plain sidebar row, no box at rest and
 * no chevron.
 */
const TRIGGER =
  "group/switcher flex min-h-7 max-w-full min-w-0 items-center gap-1.5 rounded pr-2 pl-1.5 py-1 text-left text-sm text-sidebar-foreground/95 hover:bg-accent/60 data-[state=open]:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9";

/** A choice row: the tick leads, the way this plugin's other menus do. */
const CHOICE = cn(
  VIEW_MENU_ITEM,
  "pl-2 pr-3 text-muted-foreground data-[state=checked]:text-foreground",
);
const CHECK_SLOT = "flex size-3.5 shrink-0 items-center justify-center";

/** A project's glyph or uploaded image, or the plain folder for All projects. */
function ProjectGlyph({
  icon,
  className,
}: {
  icon?: ProjectIcon | null | undefined;
  className?: string | undefined;
}) {
  return (
    <ProjectIconMark
      icon={icon ?? null}
      fallback="Folder"
      className={cn("size-4", className)}
      mutedClassName="text-sidebar-foreground/73"
    />
  );
}

/**
 * The switcher's label: every project, one project by name, or a count. A list
 * the switcher cannot produce (an empty or multi-project filter left by an
 * older client) still reads truthfully instead of claiming "All projects".
 */
export function projectSwitcherLabel(
  selected: readonly string[] | null,
  projects: readonly ProjectIdentity[],
): string {
  if (selected === null) return "All projects";
  if (selected.length === 1) {
    const only = selected[0]!;
    if (only === NO_PROJECT_KEY) return "No project";
    return projects.find((project) => project.id === only)?.label ?? "1 project";
  }
  return `${selected.length} projects`;
}

export interface ProjectSwitcherProps {
  /** Every project the switcher offers, in filter-menu order. */
  projects: readonly ProjectIdentity[];
  /** The persisted project filter: null is every project. */
  selected: readonly string[] | null;
  /** A project's chosen icon, or null for the folder. */
  iconFor: (projectId: string) => ProjectIcon | null;
  /** Pick one project, or null for All projects. */
  onSelect: (projectId: string | null) => void;
  /** Set the chosen project's icon; only offered for one real project. */
  onSetIcon?: ((anchor: HTMLElement) => void) | undefined;
  /** Open BB's own Add project dialog. */
  onNewProject?: ((trigger: EventTarget) => void) | undefined;
}

/**
 * The project switcher in the fixed toolbar above the thread list: one row
 * naming the scope, opening a menu of every project. Single-select only — the
 * persisted filter stays a list, so this narrows it to one id or widens it back
 * to null. It stays visible while a persisted filter needs clearing, and while
 * "New project…" is offered, even when there is nothing to switch between: an
 * empty project or a project with no threads must not strand the filter.
 */
export function ProjectSwitcher({
  projects,
  selected,
  iconFor,
  onSelect,
  onSetIcon,
  onNewProject,
}: ProjectSwitcherProps) {
  const scope = usePortalScopeProps();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (
    selected === null &&
    projects.length < 2 &&
    onNewProject === undefined
  ) {
    return null;
  }

  const label = projectSwitcherLabel(selected, projects);
  const currentId = selected !== null && selected.length === 1 ? selected[0]! : null;
  const triggerIcon = currentId === null ? null : iconFor(currentId);
  // A multi-project filter left by an older client matches no row, so no check
  // claims one; the label already says how many.
  const value =
    selected === null ? ALL_PROJECTS : selected.length === 1 ? selected[0]! : MULTIPLE_PROJECTS;

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Project: ${label}`}
          title={label}
          className={TRIGGER}
        >
          <ProjectGlyph icon={triggerIcon} />
          <span className="min-w-0 truncate font-medium">{label}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...scope}
          align="start"
          sideOffset={4}
          className={cn(VIEW_MENU_CONTENT, "w-max min-w-48")}
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => onSelect(next === ALL_PROJECTS ? null : next)}
          >
            <DropdownMenu.RadioItem value={ALL_PROJECTS} className={CHOICE}>
              <span className={CHECK_SLOT}>
                <DropdownMenu.ItemIndicator>
                  <Icon name="Check" className="size-3.5 text-primary" />
                </DropdownMenu.ItemIndicator>
              </span>
              <ProjectGlyph />
              <span className="min-w-0 flex-1 truncate">All projects</span>
            </DropdownMenu.RadioItem>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            {projects.map((project) => (
              <DropdownMenu.RadioItem key={project.id} value={project.id} className={CHOICE}>
                <span className={CHECK_SLOT}>
                  <DropdownMenu.ItemIndicator>
                    <Icon name="Check" className="size-3.5 text-primary" />
                  </DropdownMenu.ItemIndicator>
                </span>
                <ProjectGlyph icon={iconFor(project.id)} />
                <span className="min-w-0 flex-1 truncate">{project.label}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {onSetIcon !== undefined || onNewProject !== undefined ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              {onSetIcon !== undefined ? (
                <DropdownMenu.Item
                  className={cn(VIEW_MENU_ITEM, "text-muted-foreground")}
                  onSelect={() => {
                    const trigger = triggerRef.current;
                    if (trigger !== null) onSetIcon(trigger);
                  }}
                >
                  <span className={CHECK_SLOT} aria-hidden="true" />
                  <Icon name="Palette" className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">Set icon…</span>
                </DropdownMenu.Item>
              ) : null}
              {onNewProject !== undefined ? (
                <DropdownMenu.Item
                  className={cn(VIEW_MENU_ITEM, "text-muted-foreground")}
                  onSelect={() => {
                    // Start from the trigger: the menu item sits in a portal,
                    // too far down the React tree to reach bb's provider.
                    const trigger = triggerRef.current;
                    if (trigger !== null) onNewProject(trigger);
                  }}
                >
                  <span className={CHECK_SLOT} aria-hidden="true" />
                  <Icon name="FolderPlus" className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">New project…</span>
                </DropdownMenu.Item>
              ) : null}
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
