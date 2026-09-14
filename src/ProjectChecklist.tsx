import * as Popover from "@radix-ui/react-popover";
import { usePortalScopeProps } from "@/lib/portal-scope";

export function ProjectChecklist({ projects, hiddenIds, onVisibilityChange }: {
  projects: readonly { id: string; name: string }[];
  hiddenIds: ReadonlySet<string>;
  onVisibilityChange: (id: string, visible: boolean) => void;
}) {
  const scopeProps = usePortalScopeProps();
  const visibleCount = projects.filter((project) => !hiddenIds.has(project.id)).length;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Project options: ${visibleCount} of ${projects.length} shown`}
          title="Project options"
          className="flex min-h-7 min-w-0 flex-1 items-center rounded py-0.5 pl-3 pr-1.5 text-xs font-medium text-muted-foreground/55 hover:text-foreground data-[state=open]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
        >
          Projects
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          {...scopeProps}
          aria-label="Project options"
          align="start"
          sideOffset={4}
          className="ps-project-checklist z-50 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <p className="px-2 pb-1 pt-1 text-xs text-muted-foreground">Show in sidebar</p>
          <p className="px-2 py-2 text-xs text-muted-foreground">Tap to open. Hold a project or parent to show children; hold a chat or swipe left for actions. Keyboard: Actions or Shift+F10.</p>
          <div className="max-h-72 overflow-y-auto">
            {projects.map((project) => (
              <label key={project.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent focus-within:bg-accent">
                <input
                  type="checkbox"
                  aria-label={`Show ${project.name}`}
                  checked={!hiddenIds.has(project.id)}
                  onChange={(event) => onVisibilityChange(project.id, event.currentTarget.checked)}
                  className="size-3.5 shrink-0 accent-primary"
                />
                <span className="min-w-0 truncate" title={project.name}>{project.name}</span>
              </label>
            ))}
            {projects.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">No projects yet</p> : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
