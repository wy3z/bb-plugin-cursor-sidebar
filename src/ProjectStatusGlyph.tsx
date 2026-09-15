import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ThreadStatusKind } from "./status";

/**
 * The Core/Project heading's left slot. It always draws exactly one glyph in
 * the same fixed 16px box as thread rows, so headings never shift:
 *
 *   working -> the stock `Loading` spinner (native colour + spin)
 *   idle    -> a nut (cog-style) for a Core, or the Core's own glyph when
 *              one already exists; a smaller Folder for a native Project
 *
 * Core attention/status is a small coloured dot on the glyph, not a trailing
 * icon. No glyph picker.
 */
export type ActivityState = "inactive" | "working" | "complete" | "attention" | "review";

export type CoreStatusBadge = "none" | "complete" | "input" | "warning" | "failed";

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

/** Complete / question / orange warning / red, as a dot on the Core glyph. */
export function coreStatusBadge(
  status: ThreadStatusKind | null | undefined,
  conflicted = false,
): CoreStatusBadge {
  if (conflicted) return "warning";
  switch (status) {
    case "failed":
      return "failed";
    case "input":
      return "input";
    case "review":
      return "complete";
    case "unavailable":
      return "warning";
    default:
      return "none";
  }
}

const BADGE_TONE: Record<Exclude<CoreStatusBadge, "none">, string> = {
  complete: "bg-timeline-accent",
  input: "bg-muted-foreground/70",
  warning: "bg-warning-text",
  failed: "bg-destructive",
};

const BADGE_LABEL: Record<Exclude<CoreStatusBadge, "none">, string> = {
  complete: "Completed",
  input: "Needs your input",
  warning: "Needs attention",
  failed: "Failed",
};

/** Existing BB Icon primitives only; no custom glyphs and no picker. */
export function ProjectStatusGlyph({
  kind,
  working,
  badge = "none",
  label,
  className,
  logoUrl,
}: {
  kind: "core" | "project";
  working: boolean;
  badge?: CoreStatusBadge;
  label: string;
  className?: string;
  /** Provider logo already on the Core's coordinator; kept when present. */
  logoUrl?: string | null;
}) {
  const name: IconName = working ? "Loading" : kind === "core" ? "Nut" : "Folder";
  const iconClass = working
    ? "size-3.5 animate-spin text-muted-foreground/50"
    : kind === "project"
      ? "size-3 text-muted-foreground/70"
      : "size-3.5 text-muted-foreground/70";
  const mark = kind === "core" && badge !== "none" ? badge : null;
  const ownLogo = kind === "core" && !working && Boolean(logoUrl);
  return (
    <span
      role="img"
      aria-label={mark ? `${label}. ${BADGE_LABEL[mark]}` : label}
      data-activity={working ? "working" : "idle"}
      data-heading-kind={kind}
      data-core-badge={mark ?? undefined}
      data-core-glyph={kind === "core" ? (ownLogo ? "own" : "nut") : undefined}
      className={cn("ps-project-glyph", className)}
    >
      <span className="relative inline-flex">
        {ownLogo ? (
          <img
            src={logoUrl!}
            alt=""
            className="size-3.5 shrink-0 rounded-[2px] object-contain"
          />
        ) : (
          <Icon
            name={name}
            aria-hidden="true"
            className={cn("shrink-0", iconClass)}
          />
        )}
        {mark ? (
          <span
            aria-hidden
            className={cn(
              "ps-core-badge pointer-events-none absolute -right-px -bottom-px size-1.5 rounded-full border border-sidebar",
              BADGE_TONE[mark],
            )}
          />
        ) : null}
      </span>
    </span>
  );
}
