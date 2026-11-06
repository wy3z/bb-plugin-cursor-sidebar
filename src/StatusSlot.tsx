import type { ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { isActivityIndicator } from "./StatusGlyph";
import { relativeTimeLabel } from "./relative-time";
import type { ThreadStatusKind } from "./status";
import { isWorking } from "./activity";

function activityStatusKind(status: ThreadStatusKind | undefined): boolean {
  return status === "working";
}

/**
 * Cursor-like thread lead: a gray circle that takes a status colour, or a
 * spinner while the thread is working.
 */
export function ThreadLeadStatus({
  thread,
  exactStatus,
  label,
}: {
  thread: PluginSidebarThread;
  exactStatus: ThreadStatusKind | undefined;
  label: string | null;
}) {
  const working =
    activityStatusKind(exactStatus) ||
    isWorking(thread) ||
    isActivityIndicator(thread.indicator);
  if (working) {
    // BB's default thread-row spinner size (size-4).
    return (
      <Icon
        name="Loading"
        aria-label={label ?? "Working"}
        className="size-4 shrink-0 animate-spin text-sidebar-foreground/73"
      />
    );
  }
  const tone =
    exactStatus === "failed" || thread.indicator === "unread-error"
      ? "bg-destructive"
      : exactStatus === "input" || thread.indicator === "waiting-for-input"
        ? "bg-warning-text"
        : thread.indicator === "unread-success"
          ? "bg-timeline-accent"
          : thread.isUnread
            ? "bg-muted-foreground/65"
            : "bg-muted-foreground/30";
  return (
    <span
      role="img"
      aria-label={label ?? (thread.isUnread ? "Unread" : "Idle")}
      className={cn("size-2 shrink-0 rounded-full", tone)}
    />
  );
}

/** The trailing age label. Status lives in the left slot, never here. */
export function ThreadAge({ thread, now }: { thread: PluginSidebarThread; now: number }) {
  return (
    <span
      className={cn(
        "tabular-nums text-xs text-sidebar-foreground/45",
      )}
    >
      {relativeTimeLabel(thread.updatedAt, now)}
    </span>
  );
}

export function ThreadLeadIcon({
  thread,
  exactStatus,
  label,
  children,
}: {
  thread: PluginSidebarThread;
  exactStatus: ThreadStatusKind | undefined;
  label: string | null;
  children: ReactNode;
}) {
  const working =
    activityStatusKind(exactStatus) ||
    isWorking(thread) ||
    isActivityIndicator(thread.indicator);
  const tone = working
    ? null
    : exactStatus === "failed" || thread.indicator === "unread-error"
      ? "bg-destructive"
      : exactStatus === "input" || thread.indicator === "waiting-for-input"
        ? "bg-warning-text"
        : thread.indicator === "unread-success"
          ? "bg-timeline-accent"
          : thread.isUnread
            ? "bg-muted-foreground/80"
            : null;
  return (
    <span
      role="img"
      aria-label={label ?? (working ? "Working" : thread.isUnread ? "Unread" : "Idle")}
      className="cs-lead-icon relative flex size-4 shrink-0 items-center justify-center"
      data-working={working || undefined}
    >
      <span className="cs-lead-icon__mark flex">{children}</span>
      {working ? (
        <Icon name="Loading" className="cs-lead-icon__spinner absolute size-4 animate-spin text-sidebar-foreground/85" />
      ) : null}
      {tone ? <span className={cn("cs-lead-icon__badge absolute rounded-full", tone)} /> : null}
    </span>
  );
}
