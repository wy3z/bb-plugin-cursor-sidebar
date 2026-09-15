import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ThreadStatusKind } from "./status";

/**
 * The Core/Project heading's left slot. It always draws exactly one glyph in
 * the same fixed 16px box as thread rows, so headings never shift:
 *
 *   working -> the stock `Loading` spinner (native colour + spin)
 *   idle    -> `Bot` for a Core, `Folder` for a native Project
 *
 * Attention/status never lives here: those marks trail on the right with the
 * last-updated time. Built only from existing BB Icon primitives.
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

export function headingIsWorking(status: ThreadStatusKind | null | undefined): boolean {
  return status === "working" || status === "queued";
}

export function headingShowsTrailingStatus(status: ThreadStatusKind | null | undefined): boolean {
  return status === "input" || status === "failed" || status === "review" || status === "unavailable";
}

/** Existing BB Icon primitives only; no custom glyphs. */
export function ProjectStatusGlyph({
  kind,
  working,
  label,
  className,
}: {
  kind: "core" | "project";
  working: boolean;
  label: string;
  className?: string;
}) {
  const name = working ? "Loading" : kind === "core" ? "Bot" : "Folder";
  const iconClass = working
    ? "animate-spin text-muted-foreground/50"
    : "text-muted-foreground/70";
  return (
    <span
      role="img"
      aria-label={label}
      data-activity={working ? "working" : "idle"}
      data-heading-kind={kind}
      className={cn("ps-project-glyph", className)}
    >
      <Icon
        name={name}
        aria-hidden="true"
        className={cn("size-4 shrink-0", iconClass)}
      />
    </span>
  );
}
