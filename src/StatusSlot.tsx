import type { ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { StatusGlyph, hasStatusGlyph, isActivityIndicator, isTrailingStatusIndicator } from "./StatusGlyph";
import { relativeTimeLabel } from "./relative-time";
import type { ThreadStatusKind } from "./status";
import { isWorking } from "./activity";

/**
 * The compact status line (mobile): the status glyph while the thread has
 * something to say, else the relative age. Desktop rows instead always draw
 * the leading slot (`RowStatusSlot`) and always trail the age (`ThreadAge`),
 * so this compact either/or only renders where space is tight.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */
export function StatusOrTime({
  thread,
  now,
  showTime = true,
}: {
  thread: PluginSidebarThread;
  /** Quantized clock, shared by every row in one render. */
  now: number;
  /**
   * When false the relative age is suppressed, matching the Updated time Show
   * toggle. A status glyph still draws, so a row never loses its status.
   */
  showTime?: boolean;
}) {
  if (hasStatusGlyph(thread.indicator)) {
    return (
      <StatusGlyph indicator={thread.indicator} label={thread.indicatorLabel} />
    );
  }
  if (!showTime) return null;
  return (
    <span className="tabular-nums text-xs text-muted-foreground/80">
      {relativeTimeLabel(thread.updatedAt, now)}
    </span>
  );
}

/**
 * The unread mark. A filled dot is an unread thread. Read chats draw nothing
 * here: Cursor's chat list does not use a hollow circle as a row icon, and
 * unread weight already lives on the title.
 */
export function ReadDot({ unread, label }: { unread: boolean; label?: string }) {
  const box = "flex size-3.5 shrink-0 items-center justify-center";
  if (!unread) return null;
  return (
    <span role="img" aria-label={label ?? "Unread"} className={box}>
      <span className="size-[5px] rounded-full bg-timeline-accent" />
    </span>
  );
}

/**
 * The row's left slot: live activity only. Idle chats keep the empty 16px box
 * so titles stay aligned with Project icons; unread weight lives on the
 * title, and attention marks trail on the right.
 */
export function RowStatusSlot({ thread }: { thread: PluginSidebarThread }) {
  return (
    <span className="ps-status-slot pointer-events-none flex w-4 shrink-0 items-center justify-center">
      {isActivityIndicator(thread.indicator) ? (
        <StatusGlyph indicator={thread.indicator} label={thread.indicatorLabel} />
      ) : null}
    </span>
  );
}

/** Status + last-updated time, always the row's trailing column. */
export function TrailingMeta({
  status,
  updatedAt,
  now,
  showTime,
}: {
  status?: ReactNode;
  updatedAt: number | null | undefined;
  now: number;
  showTime: boolean;
}) {
  const time = showTime && updatedAt != null && updatedAt > 0
    ? relativeTimeLabel(updatedAt, now)
    : null;
  if (!status && time === null) return null;
  return (
    <span className="ps-thread-meta pointer-events-none flex min-w-6 shrink-0 items-center justify-end gap-1 pl-1">
      {status}
      {time !== null ? (
        <span className="ps-thread-time tabular-nums text-xs text-muted-foreground/80">
          {time}
        </span>
      ) : null}
    </span>
  );
}

export function trailingStatusKind(status: ThreadStatusKind | undefined): boolean {
  return status === "input" || status === "failed";
}

export function activityStatusKind(status: ThreadStatusKind | undefined): boolean {
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
        className="size-4 shrink-0 animate-spin text-muted-foreground/50"
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

export { isActivityIndicator, isTrailingStatusIndicator };

/** The trailing age label. Status lives in the left slot, never here. */
export function ThreadAge({ thread, now }: { thread: PluginSidebarThread; now: number }) {
  return (
    <span
      className={cn(
        "tabular-nums text-xs text-muted-foreground/80",
      )}
    >
      {relativeTimeLabel(thread.updatedAt, now)}
    </span>
  );
}

/**
 * The left slot for a row whose computed status is stronger than the native
 * indicator. Draws only the attention-bearing kinds; `idle` and `unread` fall
 * back to the read dot the caller renders.
 */
export function StatusFromKind({
  status,
  label,
}: {
  status: ThreadStatusKind;
  label: string | null;
}) {
  const shared = "size-3.5 shrink-0";
  const aria = label ?? undefined;
  switch (status) {
    case "failed":
      return <Icon name="CircleX" aria-label={aria} className={cn(shared, "text-destructive")} />;
    case "input":
      return <Icon name="CircleQuestion" aria-label={aria} className={cn(shared, "text-muted-foreground/75")} />;
    case "working":
      return <Icon name="Loading" aria-label={aria} className={cn("size-4 shrink-0 animate-spin text-muted-foreground/50")} />;
    default:
      return null;
  }
}
