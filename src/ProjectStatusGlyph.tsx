import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ThreadStatusKind } from "./status";

/**
 * The Project heading's left slot. Always a folder in the same 16px box as
 * thread discs, so headings never shift. Live work is drawn on the thread
 * rows, never on the project glyph.
 */
export type ActivityState = "inactive" | "working" | "complete" | "attention";

export const ACTIVITY_LABELS: Record<ActivityState, string> = {
  inactive: "Inactive",
  working: "Working",
  complete: "Completed",
  attention: "Needs your input",
};

/** Precedence: a pending interaction outranks live work, which outranks history. */
export function activityStateFor(
  attention: boolean,
  working: boolean,
  complete: boolean,
): ActivityState {
  if (attention) return "attention";
  if (working) return "working";
  if (complete) return "complete";
  return "inactive";
}

/** Map the resolved status precedence onto the glyph's resting states. */
export function glyphStateForStatus(status: ThreadStatusKind): ActivityState {
  switch (status) {
    case "input":
    case "failed":
      return "attention";
    case "working":
      return "working";
    default:
      return "inactive";
  }
}

/** Existing BB Icon primitives only; no custom glyphs and no picker. */
export function ProjectStatusGlyph({
  open,
  label,
  className,
}: {
  /** True when the project section is expanded; picks the open folder. */
  open?: boolean;
  label: string;
  className?: string;
}) {
  // Folder (closed) and FolderOpen are Hugeicons' matched single-weight pair
  // (Folder01 / Folder02). The heavier stroke keeps both crisp at 14px.
  const name: IconName = open ? "FolderOpen" : "Folder";
  return (
    <span
      role="img"
      aria-label={label}
      data-activity="idle"
      data-heading-kind="project"
      className={cn("ps-project-glyph", className)}
    >
      <Icon
        name={name}
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground/55"
        strokeWidth={2}
      />
    </span>
  );
}
