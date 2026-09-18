import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";

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
