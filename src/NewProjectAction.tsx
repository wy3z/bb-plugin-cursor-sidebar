import * as Popover from "@radix-ui/react-popover";
import { Icon } from "@/components/ui/icon";
import { ANCHORED_OVERLAY_MOTION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { ICON_BTN } from "./icon-btn";

/**
 * Header create action: one plain plus in every grouping. Choosing a native
 * Project opens a new chat in that working directory.
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
          className={cn("cs-new-project ml-3 max-md:pointer-coarse:ml-0", ICON_BTN)}
        >
          <Icon name="Plus" className="size-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          {...scopeProps}
          aria-label={label}
          align="end"
          sideOffset={4}
          className={cn(
            "cs-new-project-dialog z-50 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md",
            ANCHORED_OVERLAY_MOTION,
          )}
        >
          <p className="px-2 py-1 text-xs font-medium">{label}</p>
          <p className="px-2 pb-1 text-xs text-sidebar-foreground/73">{prompt}</p>
          {projects.length === 0 ? (
            <p className="px-2 py-2 text-xs text-sidebar-foreground/73">No working directories available</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {projects.map((project) => (
                <Popover.Close key={project.id} asChild>
                  <button
                    type="button"
                    onClick={() => onSelect(project)}
                    className="flex w-full items-center rounded px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 truncate" title={project.name}>{project.name}</span>
                  </button>
                </Popover.Close>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
