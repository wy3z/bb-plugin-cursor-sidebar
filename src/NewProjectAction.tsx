import * as Popover from "@radix-ui/react-popover";
import { Icon } from "@/components/ui/icon";
import { usePortalScopeProps } from "@/lib/portal-scope";

/**
 * Header create action: BB's new-thread bubble. Choosing a native Project
 * opens a new chat in that working directory.
 */
export function NewProjectAction({
  projects,
  onSelect,
  label = "New chat",
  prompt = "Choose the Project for the new chat.",
}: {
  projects: readonly { id: string; name: string }[];
  onSelect: (project: { id: string; name: string }) => void;
  label?: string;
  prompt?: string;
}) {
  const scopeProps = usePortalScopeProps();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="ps-new-project flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:size-9"
        >
          <Icon name="MessageSquarePlus" className="size-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          {...scopeProps}
          aria-label={label}
          align="end"
          sideOffset={4}
          className="ps-new-project-dialog z-50 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <p className="px-2 py-1 text-xs font-medium">{label}</p>
          <p className="px-2 pb-1 text-xs text-muted-foreground">{prompt}</p>
          {projects.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No working directories available</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onSelect(project)}
                  className="flex w-full items-center rounded px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="min-w-0 truncate" title={project.name}>{project.name}</span>
                </button>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
