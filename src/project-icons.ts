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

/**
 * What a project heading wears in place of the folder: a glyph from the
 * catalog, or an uploaded image stored as a PNG data URL.
 */
export type ProjectIcon =
  | { kind: "glyph"; name: IconName }
  | { kind: "image"; src: string };

const IMAGE_PREFIX = "data:image/png;base64,";

/** Read one stored overlay value; an unknown or stale value is unset. */
export function parseProjectIcon(stored: string): ProjectIcon | null {
  if (stored.startsWith(IMAGE_PREFIX)) return { kind: "image", src: stored };
  return PROJECT_ICON_NAME_SET.has(stored) ? { kind: "glyph", name: stored as IconName } : null;
}

/** The overlay value the server stores for one icon. */
export function serializeProjectIcon(icon: ProjectIcon): string {
  return icon.kind === "glyph" ? icon.name : icon.src;
}

/** Longest edge of a stored image; 4x the 16px slot covers high-DPI screens. */
const IMAGE_ICON_SIZE = 64;

/**
 * Shrink an uploaded image to fit a 64px square and re-encode it as PNG, so
 * transparency survives and the stored value stays a few KB. Anything the
 * browser cannot decode rejects.
 */
export async function imageFileToProjectIcon(file: File): Promise<ProjectIcon> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || IMAGE_ICON_SIZE;
    const height = image.naturalHeight || IMAGE_ICON_SIZE;
    const scale = Math.min(1, IMAGE_ICON_SIZE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas is unavailable.");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { kind: "image", src: canvas.toDataURL("image/png") };
  } finally {
    URL.revokeObjectURL(url);
  }
}
