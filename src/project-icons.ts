import { ICON_NAMES, type IconName } from "@/components/ui/icon";

/**
 * The one place that decides which registry glyphs a project may wear. Chrome
 * is anything that reads as an affordance or a live status rather than an
 * identity: navigation arrows, busy/status decoration, dismiss/overflow
 * controls, filter/layout tools and direct actions. Everything left over is a
 * candidate project icon.
 */
const CHROME_ICON_NAMES: ReadonlySet<IconName> = new Set<IconName>([
  // Navigation and disclosure.
  "ChevronDown",
  "ChevronLeft",
  "ChevronRight",
  "ChevronUp",
  "ChevronsDown",
  "ChevronsUp",
  "ArrowDown",
  "ArrowRight",
  "ArrowUp",
  "ArrowUpDown",
  "ArrowUpRight",
  "ArrowReloadHorizontal",
  "ArrowTurnBackward",
  "ArrowTurnForward",
  "CornerDownLeft",
  "CornerDownRight",
  // Busy and status decoration.
  "Loading",
  "Spinner",
  "AlertCircle",
  "AlertTriangle",
  "Circle",
  "CircleCheck",
  "CircleQuestion",
  "CircleX",
  "CircleArrowShrink",
  // Dismiss, overflow and row chrome.
  "X",
  "ClosePluginPane",
  "CloseThreadPane",
  "MoreHorizontal",
  "SectionAdd",
  // Filters, layout and formatting tools.
  "ListFilter",
  "SlidersHorizontal",
  "PanelLeft",
  "PanelBottom",
  "PanelRight",
  "Columns2",
  "Rows2",
  "GridView",
  "ListView",
  "Sort",
  "TextWrap",
  "AlignLeft",
  // Direct actions.
  "Edit",
  "EditFile",
  "Copy",
  "Trash2",
  "Download",
  "Search",
  "Check",
  "Plus",
  "Maximize2",
  "Minimize2",
  "ZoomIn",
  "ZoomOut",
  "NewTab",
  "ExternalLink",
  "DragDropHorizontal",
  "DragDropVertical",
]);

/** Every glyph a project heading may use, in registry order. */
export const PROJECT_ICON_NAMES: readonly IconName[] = ICON_NAMES.filter(
  (name) => !CHROME_ICON_NAMES.has(name),
);
