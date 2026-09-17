import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ThreadStatusKind } from "./status";

/**
 * The Project heading's left slot. Always a folder in the same 16px box as
 * thread discs, so headings never shift. Live work is drawn on the thread
 * rows; a closed folder instead keeps a small status badge on the glyph, since
 * its rows are hidden.
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

/** Existing BB Icon primitives only; a chosen project icon swaps the folder. */
export function ProjectStatusGlyph({
  open,
  icon,
  label,
  status = "idle",
  className,
}: {
  /** True when the project section is expanded; picks the open folder. */
  open?: boolean;
  /** A chosen project icon; its presence replaces the Folder/FolderOpen pair. */
  icon?: IconName | null;
  label: string;
  /** The project's aggregated status, badged on the closed folder. */
  status?: ThreadStatusKind;
  className?: string;
}) {
  // Folder (closed) and FolderOpen are Hugeicons' matched single-weight pair
  // (Folder01 / Folder02). The heavier stroke keeps both crisp at 14px.
  const name: IconName = icon ?? (open ? "FolderOpen" : "Folder");
  // A closed folder hides its rows, so an active status keeps a small badge on
  // the glyph's bottom-right. An open folder shows the status on the rows.
  const badge = !open && status !== "idle" ? status : null;
  const activity: ActivityState =
    status === "working" ? "working" : badge !== null ? "attention" : "inactive";
  return (
    <span
      role="img"
      aria-label={label}
      data-activity={activity}
      data-heading-kind="project"
      className={cn("ps-project-glyph relative", className)}
    >
      <Icon
        name={name}
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground/55"
        strokeWidth={2}
      />
      {badge !== null ? <ProjectStatusBadge status={badge} /> : null}
    </span>
  );
}

/** The mini status on a closed project: a spinner for work, a dot otherwise. */
function ProjectStatusBadge({ status }: { status: ThreadStatusKind }) {
  const tone =
    status === "failed"
      ? "bg-destructive"
      : status === "input"
        ? "bg-warning-text"
        : "bg-timeline-accent";
  return (
    <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex size-3 items-center justify-center">
      {status === "working" ? (
        <Icon
          name="Loading"
          aria-hidden="true"
          strokeWidth={1.5}
          className="size-3 animate-spin text-muted-foreground"
        />
      ) : (
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone)} />
      )}
    </span>
  );
}
