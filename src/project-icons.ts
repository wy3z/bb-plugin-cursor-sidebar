import type { IconName } from "@/components/ui/icon";

/**
 * The project-icon catalog: the 48 glyphs Cursor offers as project identity,
 * plus the popular ones T3 Code's picker offers, each mapped to the nearest
 * name in this plugin's icon registry. They are one flat grid, not themed
 * groups, because the set is short enough to read at a glance.
 *
 * Cursor's own picker lists its whole icon font, chrome included, which is why
 * this stays a short list of identities instead: nothing here can be mistaken
 * for a sidebar affordance, a VCS mark or a status badge.
 *
 * Where a Cursor or T3 Code name has no like-named equivalent here:
 *   chip -> Chip, file-text -> FileText, files -> FileStack, book-open -> BookOpen,
 *   link -> ExternalLink, chat-bubbles -> Chat, envelope -> Mail, paperplane -> Sent,
 *   board-kanban -> GridView, list-todo -> ListTodo, chart-bars -> ChartColumn,
 *   graph-line -> ChartLine, magic-wand -> MagicWand, lightning -> Zap,
 *   smiley-happy -> Smile, folder-code -> FolderCode, sparkles -> Sparkle,
 *   cloud-cog -> CloudCog, flask-conical -> FlaskConical,
 *   shield-check -> SecurityCheck, gamepad-2 -> Gamepad,
 *   shopping-bag -> ShoppingBag, layers-3 -> Layers
 */
export const PROJECT_ICON_NAMES: readonly IconName[] = [
  "Code", "Terminal", "Bug", "GitBranch", "Brackets", "Chip",
  "Folder", "FolderCode", "FileText", "FileStack", "BookOpen", "Library",
  "Globe", "Browser", "ExternalLink", "Cloud", "CloudCog", "Server",
  "Database", "Shield", "SecurityCheck", "Zap", "Rocket",
  "ChartColumn", "ChartLine", "Table", "Atom", "Beaker", "FlaskConical",
  "Microscope", "Brain", "Bot", "Workflow", "Package", "Layers",
  "Palette", "Brush", "Camera", "Image", "Music", "MagicWand", "Gamepad",
  "Briefcase", "Calendar", "ListTodo", "GridView", "ShoppingBag",
  "Megaphone", "Chat", "Mail", "Sent", "Wrench", "Monitor", "Smartphone",
  "Target", "Flag", "Star", "Sparkle", "Heart", "Moon", "Smile",
];

/** Set view of the catalog, for validating a stored glyph name. */
export const PROJECT_ICON_NAME_SET: ReadonlySet<string> = new Set(PROJECT_ICON_NAMES);

/**
 * The catalog names that stand in for T3 Code's popular-icon row, in the same
 * order. Shown when the search box is empty; a query searches the whole
 * catalog instead.
 */
export const POPULAR_PROJECT_ICON_NAMES: readonly IconName[] = [
  "FolderCode", "Code", "Terminal", "Globe", "Server", "Database",
  "Bot", "Sparkle", "Smartphone", "Monitor", "CloudCog", "Package",
  "BookOpen", "FlaskConical", "SecurityCheck", "Rocket", "Gamepad",
  "Music", "Image", "ShoppingBag", "GitBranch", "Workflow", "Wrench",
  "Layers",
];

/** The emoji grid. Ported from T3 Code's PROJECT_EMOJIS. */
export const PROJECT_EMOJIS: ReadonlyArray<{ readonly emoji: string; readonly label: string }> = [
  { emoji: "💻", label: "Computer" },
  { emoji: "🛠️", label: "Tools" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "🤖", label: "Robot" },
  { emoji: "✨", label: "Sparkles" },
  { emoji: "⚡", label: "Lightning" },
  { emoji: "🌐", label: "Web" },
  { emoji: "📱", label: "Mobile" },
  { emoji: "🖥️", label: "Desktop" },
  { emoji: "⌨️", label: "Keyboard" },
  { emoji: "⚙️", label: "Gear" },
  { emoji: "🗄️", label: "Database" },
  { emoji: "☁️", label: "Cloud" },
  { emoji: "📦", label: "Package" },
  { emoji: "📚", label: "Books" },
  { emoji: "🧪", label: "Test tube" },
  { emoji: "🔒", label: "Lock" },
  { emoji: "🎮", label: "Game" },
  { emoji: "🎵", label: "Music" },
  { emoji: "🎬", label: "Movie" },
  { emoji: "🖼️", label: "Picture" },
  { emoji: "🛍️", label: "Shopping" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "💡", label: "Idea" },
  { emoji: "🧩", label: "Puzzle" },
  { emoji: "📊", label: "Chart" },
  { emoji: "🧠", label: "Brain" },
  { emoji: "🦄", label: "Unicorn" },
  { emoji: "🐙", label: "Octopus" },
  { emoji: "🌱", label: "Seedling" },
];

/** Popular names at rest; otherwise the whole catalog, filtered in place. */
export function filterProjectIconNames(query: string): readonly IconName[] {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, "-");
  if (!normalized) return POPULAR_PROJECT_ICON_NAMES;
  return PROJECT_ICON_NAMES.filter((name) => name.toLowerCase().includes(normalized)).slice(0, 60);
}

/**
 * The 18 project colours, ported from T3 Code's projectIconColors.ts. The
 * class names are declared in app.css as custom properties so the dark value
 * follows BB's `html.dark` theme class; Tailwind's own `dark:` variant is
 * prefers-color-scheme and would ignore BB's toggle.
 */
export const PROJECT_ICON_COLORS: ReadonlyArray<{
  readonly value: ProjectIconColor;
  readonly label: string;
  readonly className: string;
}> = [
  { value: "gray", label: "Gray", className: "cs-pi-gray" },
  { value: "red", label: "Red", className: "cs-pi-red" },
  { value: "orange", label: "Orange", className: "cs-pi-orange" },
  { value: "amber", label: "Amber", className: "cs-pi-amber" },
  { value: "yellow", label: "Yellow", className: "cs-pi-yellow" },
  { value: "lime", label: "Lime", className: "cs-pi-lime" },
  { value: "green", label: "Green", className: "cs-pi-green" },
  { value: "emerald", label: "Emerald", className: "cs-pi-emerald" },
  { value: "teal", label: "Teal", className: "cs-pi-teal" },
  { value: "cyan", label: "Cyan", className: "cs-pi-cyan" },
  { value: "sky", label: "Sky", className: "cs-pi-sky" },
  { value: "blue", label: "Blue", className: "cs-pi-blue" },
  { value: "indigo", label: "Indigo", className: "cs-pi-indigo" },
  { value: "violet", label: "Violet", className: "cs-pi-violet" },
  { value: "purple", label: "Purple", className: "cs-pi-purple" },
  { value: "fuchsia", label: "Fuchsia", className: "cs-pi-fuchsia" },
  { value: "pink", label: "Pink", className: "cs-pi-pink" },
  { value: "rose", label: "Rose", className: "cs-pi-rose" },
];

export type ProjectIconColor =
  | "gray" | "red" | "orange" | "amber" | "yellow" | "lime" | "green" | "emerald"
  | "teal" | "cyan" | "sky" | "blue" | "indigo" | "violet" | "purple" | "fuchsia"
  | "pink" | "rose";

const PROJECT_ICON_COLOR_VALUES: ReadonlySet<string> = new Set(
  PROJECT_ICON_COLORS.map((color) => color.value),
);

export function isProjectIconColor(value: string): value is ProjectIconColor {
  return PROJECT_ICON_COLOR_VALUES.has(value);
}

export function projectIconColorClassName(color: ProjectIconColor): string {
  return `cs-pi-${color}`;
}

/**
 * What a project heading wears in place of the folder: a catalog glyph in a
 * colour, an emoji, a monogram tile, or an uploaded image stored as a PNG data
 * URL. A legacy glyph with no colour keeps the old muted-foreground look.
 */
export type ProjectIcon =
  | { kind: "glyph"; name: IconName; color?: ProjectIconColor }
  | { kind: "emoji"; emoji: string }
  | { kind: "monogram"; text: string; color: ProjectIconColor }
  | { kind: "image"; src: string };

const IMAGE_PREFIX = "data:image/png;base64,";
const GLYPH_PREFIX = "glyph:";
const EMOJI_PREFIX = "emoji:";
const MONOGRAM_PREFIX = "monogram:";

/** Read one stored overlay value; an unknown or stale value is unset. */
export function parseProjectIcon(stored: string): ProjectIcon | null {
  if (stored.startsWith(IMAGE_PREFIX)) return { kind: "image", src: stored };

  if (stored.startsWith(GLYPH_PREFIX)) {
    const rest = stored.slice(GLYPH_PREFIX.length);
    const separator = rest.lastIndexOf(":");
    if (separator === -1) return null;
    const name = rest.slice(0, separator);
    const color = rest.slice(separator + 1);
    return PROJECT_ICON_NAME_SET.has(name) && isProjectIconColor(color)
      ? { kind: "glyph", name: name as IconName, color }
      : null;
  }

  if (stored.startsWith(EMOJI_PREFIX)) {
    const emoji = stored.slice(EMOJI_PREFIX.length);
    return emoji.length > 0 && emoji.length <= 32 ? { kind: "emoji", emoji } : null;
  }

  if (stored.startsWith(MONOGRAM_PREFIX)) {
    const rest = stored.slice(MONOGRAM_PREFIX.length);
    const separator = rest.lastIndexOf(":");
    if (separator === -1) return null;
    const text = normalizeMonogram(rest.slice(0, separator));
    const color = rest.slice(separator + 1);
    return isValidMonogram(text) && isProjectIconColor(color)
      ? { kind: "monogram", text, color }
      : null;
  }

  // Legacy: a bare catalog name, drawn in the old muted tone.
  return PROJECT_ICON_NAME_SET.has(stored) ? { kind: "glyph", name: stored as IconName } : null;
}

/** The overlay value the server stores for one icon. */
export function serializeProjectIcon(icon: ProjectIcon): string {
  switch (icon.kind) {
    case "glyph":
      return icon.color === undefined ? icon.name : `${GLYPH_PREFIX}${icon.name}:${icon.color}`;
    case "emoji":
      return `${EMOJI_PREFIX}${icon.emoji}`;
    case "monogram":
      return `${MONOGRAM_PREFIX}${icon.text}:${icon.color}`;
    case "image":
      return icon.src;
  }
}

const monogramSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function normalizeMonogram(text: string): string {
  return text.normalize("NFKC").trim().toUpperCase();
}

/**
 * One or two letters or numbers, with combining marks and joiners allowed.
 * Matches T3 Code's monogram contract, plus the grapheme cap its picker hint
 * promises.
 */
export function isValidMonogram(text: string): boolean {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M}\u200c\u200d]*$/u.test(text)) return false;
  return Array.from(monogramSegmenter.segment(text)).length <= 2;
}

/** The first emoji in pasted text, or null when there is none. Ported from T3. */
export function firstEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segment = monogramSegmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment;
  const isFlag = /^\p{Regional_Indicator}{2}$/u.test(segment ?? "");
  const isKeycap = /^[#*0-9]\uFE0F?\u20E3$/u.test(segment ?? "");
  if (!segment || (!/\p{Extended_Pictographic}/u.test(segment) && !isFlag && !isKeycap)) {
    return null;
  }
  return segment;
}

function normalizeProjectName(projectName: string): string {
  return projectName.normalize("NFKC").trim();
}

function projectMonogram(projectName: string): string {
  const words = normalizeProjectName(projectName).match(/[\p{L}\p{N}]+/gu) ?? [];
  const firstWord = words[0];
  if (!firstWord) return "PR";
  const glyphs = Array.from(firstWord);
  const first = glyphs[0] ?? "P";
  const second =
    glyphs.slice(1).find((glyph) => /\p{N}/u.test(glyph)) ??
    (words.length > 1 ? Array.from(words.at(-1) ?? "")[0] : glyphs.at(-1)) ??
    first;
  return Array.from(`${first}${second}`.toUpperCase()).slice(0, 2).join("");
}

function projectColor(projectName: string): ProjectIconColor {
  const seed = normalizeProjectName(projectName).toLocaleLowerCase("en-US") || "project";
  let index = 0;
  for (const glyph of seed) {
    index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % PROJECT_ICON_COLORS.length;
  }
  return PROJECT_ICON_COLORS[index]?.value ?? "blue";
}

/** A project's fallback identity, used to seed the picker. Ported from T3. */
export function deriveProjectIdentity(projectName: string): {
  monogram: string;
  color: ProjectIconColor;
} {
  return { monogram: projectMonogram(projectName), color: projectColor(projectName) };
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
