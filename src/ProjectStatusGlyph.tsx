import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ThreadStatusKind } from "./status";

/**
 * The Core heading's left status slot. It always draws exactly one glyph in the
 * same fixed 16px box as thread rows, so headings never shift:
 *
 *   working   -> the stock `Loading` spinner, unchanged (native colour + spin)
 *   attention -> `AlertTriangle` in the native warning tone
 *   review    -> `CircleCheck`, so a settled Worker awaiting review reads
 *                differently from live work
 *   idle      -> a quiet `Circle` outline (completion is worker history, not
 *                a success claim the heading should make, so a completed
 *                Core rests here too)
 *
 * Built only from existing BB Icon primitives. Child rows are unchanged.
 */
export type ActivityState = "inactive" | "working" | "complete" | "attention" | "review";

export const ACTIVITY_LABELS: Record<ActivityState, string> = {
  inactive: "Inactive",
  working: "Working",
  complete: "Completed",
  attention: "Needs your input",
  review: "For Core review",
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
    case "review":
      return "review";
    case "working":
    case "queued":
      return "working";
    default:
      return "inactive";
  }
}

/** Existing BB Icon primitives only; no custom glyphs. */
const STATE_ICON = {
  inactive: { name: "Circle", className: "text-muted-foreground/40" },
  working: { name: "Loading", className: "animate-spin text-muted-foreground/50" },
  complete: { name: "CircleCheck", className: "text-foreground" },
  attention: { name: "AlertTriangle", className: "text-warning-text" },
  review: { name: "CircleCheck", className: "text-timeline-accent" },
} as const;

export function ProjectStatusGlyph({
  state,
  label,
  className,
}: {
  state: ActivityState;
  label: string;
  className?: string;
}) {
  const icon = STATE_ICON[state];
  return (
    <span
      role="img"
      aria-label={label}
      data-activity={state}
      className={cn("ps-project-glyph", className)}
    >
      <Icon
        name={icon.name}
        aria-hidden="true"
        className={cn("size-4 shrink-0", icon.className)}
      />
    </span>
  );
}
