import type { IconName } from "@/components/ui/icon";

/**
 * The project-icon catalog: the 48 glyphs Cursor offers as project identity,
 * each mapped to the nearest name in this plugin's icon registry. They are one
 * flat grid, not themed groups, because the set is short enough to read at a
 * glance.
 *
 * Cursor's own picker lists its whole icon font, chrome included, which is why
 * this stays a short list of identities instead: nothing here can be mistaken
 * for a sidebar affordance, a VCS mark or a status badge.
 *
 * Where a Cursor name has no like-named equivalent here:
 *   chip -> Chip, file-text -> FileText, files -> FileStack, book-open -> BookOpen,
 *   link -> ExternalLink, chat-bubbles -> Chat, envelope -> Mail, paperplane -> Sent,
 *   board-kanban -> GridView, list-todo -> ListTodo, chart-bars -> ChartColumn,
 *   graph-line -> ChartLine, magic-wand -> MagicWand, lightning -> Zap,
 *   smiley-happy -> Smile
 */
export const PROJECT_ICON_NAMES: readonly IconName[] = [
  "Code", "Terminal", "Bug", "GitBranch", "Brackets", "Chip",
  "Folder", "FileText", "FileStack", "BookOpen", "Library",
  "Globe", "Browser", "ExternalLink", "Cloud", "Server",
  "Database", "Shield", "Zap", "Rocket",
  "ChartColumn", "ChartLine", "Table", "Atom", "Beaker", "Microscope", "Brain",
  "Palette", "Brush", "Camera", "Image", "Music", "MagicWand",
  "Briefcase", "Calendar", "ListTodo", "GridView", "Megaphone", "Chat", "Mail", "Sent",
  "Target", "Flag", "Star", "Sparkle", "Heart", "Moon", "Smile",
];

/** Set view of the catalog, for validating a stored glyph name. */
export const PROJECT_ICON_NAME_SET: ReadonlySet<string> = new Set(PROJECT_ICON_NAMES);
