import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ProjectIconMark } from "./ProjectIconMark";
import {
  deriveProjectIdentity,
  filterProjectIconNames,
  firstEmoji,
  imageFileToProjectIcon,
  isValidMonogram,
  normalizeMonogram,
  PROJECT_EMOJIS,
  PROJECT_ICON_COLORS,
  projectIconColorClassName,
  type ProjectIcon,
  type ProjectIconColor,
} from "./project-icons";

const DEFAULT_ICON: IconName = "FolderCode";
const DEFAULT_EMOJI = "💻";

type PickerMode = "icons" | "emoji" | "monogram";

const TABS: ReadonlyArray<{ value: PickerMode; label: string }> = [
  { value: "icons", label: "Icons" },
  { value: "emoji", label: "Emoji" },
  { value: "monogram", label: "Monogram" },
];

function modeFor(icon: ProjectIcon | null): PickerMode {
  if (icon?.kind === "emoji") return "emoji";
  if (icon?.kind === "monogram") return "monogram";
  return "icons";
}

/**
 * The project-icon dialog, a port of T3 Code's ProjectIconPickerDialog: tabs
 * for an icon, an emoji or a monogram, a search over the glyph catalog, the 18
 * project colours, a live preview and Save/Cancel. Two extras stay from this
 * plugin's own picker: an uploaded image, and Reset to default (the folder).
 *
 * It is a Radix dialog rather than the old anchored popover so the palette can
 * be wide enough to read; on a compact viewport the shared Dialog renders it
 * as a bottom drawer instead.
 */
export function ProjectIconPicker({
  open,
  onOpenChange,
  anchor,
  projectName,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The heading that opened it, so focus can return there. */
  anchor: HTMLElement | null;
  projectName: string;
  current: ProjectIcon | null;
  /** Null means "Use default": clear the overlay back to the folder glyph. */
  onPick: (icon: ProjectIcon | null) => void;
}) {
  // Clearing the picker state re-renders with anchor=null just before the
  // dialog unmounts, and Radix reads the close handler from that last render.
  // Hold the last real anchor so focus still goes back to its heading or row.
  const anchorRef = useRef<HTMLElement | null>(null);
  if (anchor !== null) anchorRef.current = anchor;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="cs-project-icon-dialog max-h-[calc(100dvh-2rem)] w-full gap-4 overflow-y-auto border-border bg-popover p-5 text-popover-foreground sm:max-w-[32rem]"
        onCloseAutoFocus={(event) => {
          // The menu item that opened this has unmounted; hand focus back to
          // the heading or row that asked for the dialog. Claim the event or
          // Radix's own restore (often <body>) wins after this.
          const target = anchorRef.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
      >
        {/* Mounts per open, so the draft below always starts from `current`. */}
        {open ? (
          <ProjectIconPickerBody
            current={current}
            projectName={projectName}
            onClose={() => onOpenChange(false)}
            onPick={onPick}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProjectIconPickerBody({
  current,
  projectName,
  onClose,
  onPick,
}: {
  current: ProjectIcon | null;
  projectName: string;
  onClose: () => void;
  onPick: (icon: ProjectIcon | null) => void;
}) {
  const automatic = useMemo(() => deriveProjectIdentity(projectName), [projectName]);
  const currentColor =
    current?.kind === "glyph"
      ? current.color
      : current?.kind === "monogram"
        ? current.color
        : undefined;
  const [mode, setMode] = useState<PickerMode>(() => modeFor(current));
  const [iconName, setIconName] = useState<IconName>(
    current?.kind === "glyph" ? current.name : DEFAULT_ICON,
  );
  const [color, setColor] = useState<ProjectIconColor>(currentColor ?? automatic.color);
  const [letters, setLetters] = useState(
    current?.kind === "monogram" ? current.text : automatic.monogram,
  );
  const [emoji, setEmoji] = useState(current?.kind === "emoji" ? current.emoji : DEFAULT_EMOJI);
  const [imageSrc, setImageSrc] = useState<string | null>(
    current?.kind === "image" ? current.src : null,
  );
  const [query, setQuery] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const icons = filterProjectIconNames(query);
  const monogram = normalizeMonogram(letters);
  const validMonogram = isValidMonogram(monogram);

  const draft: ProjectIcon =
    imageSrc !== null
      ? { kind: "image", src: imageSrc }
      : mode === "emoji"
        ? { kind: "emoji", emoji }
        : mode === "monogram"
          ? { kind: "monogram", text: monogram, color }
          : { kind: "glyph", name: iconName, color };

  const preview: ProjectIcon =
    mode === "monogram" && !validMonogram
      ? { kind: "monogram", text: automatic.monogram, color }
      : draft;

  const chooseIcon = (name: IconName) => {
    setImageSrc(null);
    setIconName(name);
  };
  const chooseEmoji = (next: string) => {
    setImageSrc(null);
    setEmoji(next);
  };
  const chooseMonogramColor = (next: ProjectIconColor) => {
    setImageSrc(null);
    setColor(next);
  };

  const save = () => {
    if (mode === "monogram" && !validMonogram) return;
    onPick(draft);
    onClose();
  };

  const onFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Clear the input so choosing the same file again still fires a change.
    input.value = "";
    if (file === undefined) return;
    try {
      const icon = await imageFileToProjectIcon(file);
      if (icon.kind === "image") setImageSrc(icon.src);
      setUploadError(null);
    } catch {
      setUploadError("That image could not be read.");
    }
  }, []);

  // Arrows walk a grid, Home/End jump its ends.
  const onGridKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-choice]"),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    if (event.key === "Home") buttons[0]?.focus();
    else if (event.key === "End") buttons[buttons.length - 1]?.focus();
    else {
      const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    }
  }, []);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose project icon</DialogTitle>
        <DialogDescription>Choose an icon, emoji, or monogram.</DialogDescription>
      </DialogHeader>

      <div
        role="tablist"
        aria-label="Icon type"
        className="flex rounded-md border border-border bg-muted/40 p-0.5"
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={mode === tab.value}
            onClick={() => setMode(tab.value)}
            className={cn(
              "flex-1 rounded-[5px] px-2 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
              mode === tab.value
                ? "bg-accent text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
        <ProjectIconMark
          icon={preview}
          fallback="Folder"
          className="size-8"
          mutedClassName="text-muted-foreground"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{projectName || "Project"}</div>
          <div className="text-xs text-muted-foreground">Preview</div>
        </div>
      </div>

      {mode !== "emoji" ? (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Color</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Icon color">
            {PROJECT_ICON_COLORS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                aria-pressed={color === option.value}
                onClick={() =>
                  mode === "monogram" ? chooseMonogramColor(option.value) : setColor(option.value)
                }
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  color === option.value && "border-foreground/60",
                )}
              >
                <span
                  className={cn("cs-pi-swatch size-4 rounded-full", projectIconColorClassName(option.value))}
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "icons" ? (
        <>
          <input
            ref={searchRef}
            type="search"
            value={query}
            aria-label="Search icons"
            placeholder="Search icons"
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring max-md:py-2.5 pointer-coarse:py-2.5"
          />
          <div className="max-h-64 overflow-y-auto">
            <div
              role="group"
              aria-label={`Icons for ${projectName}`}
              onKeyDown={onGridKeyDown}
              className="grid grid-cols-8 gap-1 p-0.5 sm:grid-cols-10 max-md:grid-cols-6 pointer-coarse:grid-cols-6"
            >
              {icons.map((name) => (
                <button
                  key={name}
                  type="button"
                  data-choice=""
                  aria-label={name}
                  title={name}
                  aria-pressed={imageSrc === null && iconName === name}
                  onClick={() => chooseIcon(name)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border border-transparent outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-md:min-w-11 pointer-coarse:min-w-11",
                    imageSrc === null && iconName === name && "border-border bg-accent",
                    projectIconColorClassName(color),
                  )}
                >
                  <Icon name={name} aria-hidden="true" className="size-5" strokeWidth={2} />
                </button>
              ))}
            </div>
            {icons.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No icons match.</p>
            ) : null}
          </div>
        </>
      ) : mode === "monogram" ? (
        <div className="flex items-center gap-4 py-2">
          <ProjectIconMark
            icon={{ kind: "monogram", text: validMonogram ? monogram : automatic.monogram, color }}
            fallback="Folder"
            className="size-12"
            mutedClassName="text-muted-foreground"
          />
          <div className="flex-1 space-y-2">
            <label htmlFor="project-monogram" className="text-sm font-medium">
              Letters
            </label>
            <input
              id="project-monogram"
              value={letters}
              maxLength={2}
              autoComplete="off"
              aria-describedby="project-monogram-hint"
              aria-invalid={!validMonogram}
              onChange={(event) => {
                setImageSrc(null);
                setLetters(event.currentTarget.value);
              }}
              className={cn(
                "w-full rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
                validMonogram ? "border-border" : "border-destructive",
              )}
            />
            <p id="project-monogram-hint" className="text-xs text-muted-foreground">
              One or two letters or numbers.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="max-h-64 overflow-y-auto">
            <div
              role="group"
              aria-label="Emoji"
              onKeyDown={onGridKeyDown}
              className="grid grid-cols-8 gap-1 p-0.5 sm:grid-cols-10 max-md:grid-cols-6 pointer-coarse:grid-cols-6"
            >
              {PROJECT_EMOJIS.map((option) => (
                <button
                  key={option.emoji}
                  type="button"
                  data-choice=""
                  aria-label={option.label}
                  aria-pressed={imageSrc === null && emoji === option.emoji}
                  onClick={() => chooseEmoji(option.emoji)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border border-transparent text-xl outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-md:min-w-11 pointer-coarse:min-w-11",
                    imageSrc === null && emoji === option.emoji && "border-border bg-accent",
                  )}
                >
                  {option.emoji}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Or paste any emoji</div>
            <input
              value={customEmoji}
              aria-label="Custom emoji"
              placeholder="Paste an emoji"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setCustomEmoji(value);
                const nextEmoji = firstEmoji(value);
                if (nextEmoji !== null) chooseEmoji(nextEmoji);
              }}
              className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring max-md:py-2.5 pointer-coarse:py-2.5"
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon name="ImageUp" aria-hidden="true" className="size-4" strokeWidth={2} />
          {current?.kind === "image" ? "Replace image" : "Upload image"}
        </button>
        <button
          type="button"
          disabled={current === null}
          onClick={() => {
            onPick(null);
            onClose();
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          <Icon name="Folder" aria-hidden="true" className="size-4" strokeWidth={2} />
          Reset to default
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/svg+xml,image/gif,image/jpeg"
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={(event) => void onFileChange(event)}
        />
        {uploadError !== null ? (
          <p role="alert" className="w-full text-xs text-destructive">
            {uploadError}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-2 text-sm hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={mode === "monogram" && !validMonogram}
          className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save icon
        </button>
      </div>
    </>
  );
}
