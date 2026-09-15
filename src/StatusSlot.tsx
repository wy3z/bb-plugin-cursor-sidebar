import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { StatusGlyph, hasStatusGlyph } from "./StatusGlyph";
import { relativeTimeLabel } from "./relative-time";
import type { ThreadStatusKind } from "./status";

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
 * The row's left status slot. A real status glyph while the thread has
 * something to say; otherwise an empty 16px box so titles stay aligned and
 * idle chats do not look like unlabeled circles.
 */
export function RowStatusSlot({ thread }: { thread: PluginSidebarThread }) {
  return (
    <span className="ps-status-slot pointer-events-none flex w-4 shrink-0 items-center justify-center">
      {hasStatusGlyph(thread.indicator) ? (
        <StatusGlyph indicator={thread.indicator} label={thread.indicatorLabel} />
      ) : (
        <ReadDot unread={thread.isUnread} label={thread.indicatorLabel ?? undefined} />
      )}
    </span>
  );
}

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
 * The left slot for a Core-owned row whose exact generation carries a status
 * the native indicator cannot show. Draws the same glyph vocabulary as the
 * heading, only for the attention-bearing kinds; `idle` and `unread` fall back
 * to the read dot the caller renders.
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
    case "review":
      return <Icon name="CircleCheck" aria-label={aria} className={cn(shared, "text-timeline-accent")} />;
    case "queued":
      return <Icon name="Spinner" aria-label={aria} className={cn(shared, "text-muted-foreground/60")} />;
    case "working":
      return <Icon name="Loading" aria-label={aria} className={cn("size-4 shrink-0 animate-spin text-muted-foreground/50")} />;
    case "unavailable":
      return <Icon name="AlertCircle" aria-label={aria} className={cn(shared, "text-muted-foreground/60")} />;
    default:
      return null;
  }
}
