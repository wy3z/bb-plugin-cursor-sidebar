import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * This plugin's status glyphs, matching bb's own sidebar: the red circle-x
 * for a failure, the circle-question for a raised hand, the stock `Loading`
 * spinner (16px, native tone) for live work, and a dot for a finished thread
 * you have not read. The desktop row always draws its leading slot with one
 * of these while the thread has something to say, else the read dot.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */

/**
 * Whether this indicator draws a status glyph in the row's leading slot. The
 * desktop row always draws that slot (this glyph when true, else the read
 * dot) and always trails the age; the compact mobile status shows this glyph
 * when true and the age otherwise. An indicator bb ships tomorrow falls
 * through to the age label rather than blanking the slot.
 */
export function hasStatusGlyph(
  indicator: PluginSidebarThreadIndicator,
): boolean {
  return isActivityIndicator(indicator) || isTrailingStatusIndicator(indicator);
}

/** Live work shown in the row's left slot, matching Cursor's activity column. */
export function isActivityIndicator(
  indicator: PluginSidebarThreadIndicator,
): boolean {
  switch (indicator) {
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
    case "draft":
    case "working-draft":
      return true;
    default:
      return false;
  }
}

/** Attention/result marks that trail on the right with the last-updated time. */
export function isTrailingStatusIndicator(
  indicator: PluginSidebarThreadIndicator,
): boolean {
  switch (indicator) {
    case "unread-error":
    case "waiting-for-input":
    case "unread-success":
      return true;
    default:
      return false;
  }
}

export function StatusGlyph({
  indicator,
  label,
  className,
}: {
  indicator: PluginSidebarThreadIndicator;
  label: string | null;
  className?: string;
}) {
  const shared = cn("size-3.5 shrink-0", className);
  const aria = label ?? undefined;

  switch (indicator) {
    case "unread-error":
      return (
        <Icon
          name="CircleX"
          aria-label={aria}
          className={cn(shared, "text-destructive")}
        />
      );
    case "waiting-for-input":
      return (
        <Icon
          name="CircleQuestion"
          aria-label={aria}
          className={cn(shared, "text-sidebar-foreground/73")}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          aria-label={aria}
          className={cn("size-4 shrink-0", className, "animate-spin text-sidebar-foreground/73")}
        />
      );
    case "workflow":
      return <ShineIcon name="Workflow" label={aria} className={shared} />;
    case "background-agent":
      return <ShineIcon name="UserRoundPlus" label={aria} className={shared} />;
    case "background-command":
      return <ShineIcon name="Terminal" label={aria} className={shared} />;
    case "plan-mode":
      return <ShineIcon name="ListTodo" label={aria} className={shared} />;
    case "goal":
      return <ShineIcon name="Target" label={aria} className={shared} />;
    case "draft":
    case "working-draft":
      return (
        <Icon
          name="Edit"
          aria-label={aria}
          className={cn(shared, "text-sidebar-foreground/73")}
        />
      );
    case "unread-success":
      // The notification dot, in a box the size of every other glyph, the way
      // bb centers its own trailing indicators.
      return (
        <span
          role="img"
          aria-label={aria}
          className={cn("flex items-center justify-center", shared)}
        >
          <span className="size-[5px] rounded-full bg-timeline-accent" />
        </span>
      );
    default:
      return null;
  }
}

function ShineIcon({
  name,
  label,
  className,
}: {
  name: Extract<
    IconName,
    "Workflow" | "UserRoundPlus" | "Terminal" | "ListTodo" | "Target"
  >;
  label: string | undefined;
  className: string;
}) {
  return (
    <Icon
      name={name}
      aria-label={label}
      className={cn("animate-shine-icon text-sidebar-foreground/73", className)}
    />
  );
}
