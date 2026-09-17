import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { PROJECT_ICON_CATEGORIES } from "./project-icons";

const ICON_COLUMNS = 8;
const ICON_ROW_HEIGHT = 30;

/**
 * Anchored glyph palette for one native project. It is a popover rather than a
 * dialog so the heading stays visible while choosing, and it offers the curated
 * PROJECT_ICON_CATEGORIES as labelled sections that the filter narrows in place.
 * At ~1200 glyphs each section mounts its buttons only once it nears the scroll
 * viewport; the label always stays mounted so the list does not collapse.
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
  anchor: HTMLElement | null;
  projectName: string;
  current: IconName | null;
  /** Null means "Use default": clear the overlay back to the folder glyph. */
  onPick: (icon: IconName | null) => void;
}) {
  const scope = usePortalScopeProps();
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PROJECT_ICON_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      icons:
        needle === ""
          ? category.icons
          : category.icons.filter((name) => name.toLowerCase().includes(needle)),
    })).filter((group) => group.icons.length > 0);
  }, [query]);

  const matchCount = useMemo(
    () => groups.reduce((total, group) => total + group.icons.length, 0),
    [groups],
  );

  const searching = query.trim() !== "";

  // Roving-ish keyboard access: arrows walk the mounted grid, Home/End jump the ends.
  const onGridKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-icon-choice]"),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    if (event.key === "Home") buttons[0]?.focus();
    else if (event.key === "End") buttons[buttons.length - 1]?.focus();
    else {
      const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const next = (index + step + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }, []);

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor virtualRef={anchorRef} />
      <Popover.Portal>
        <Popover.Content
          {...scope}
          aria-label={`Icon for ${projectName}`}
          side="bottom"
          align="start"
          sideOffset={4}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="ps-project-icon-picker z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter icons"
            aria-label="Filter icons"
            className="mb-2 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring max-md:pointer-coarse:py-2.5"
          />
          <div ref={scrollRef} className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => onPick(null)}
              aria-pressed={current === null}
              className={cn(
                "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:pointer-coarse:py-2.5",
                current === null && "bg-accent",
              )}
            >
              <Icon name="Folder" aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={2} />
              Use default
            </button>
            <div onKeyDown={onGridKeyDown}>
              {groups.map((group) => (
                <IconSection
                  key={group.id}
                  label={group.label}
                  icons={group.icons}
                  current={current}
                  onPick={onPick}
                  forceMount={searching}
                  scopeRoot={scrollRef}
                />
              ))}
              {matchCount === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">No icons match.</p>
              ) : null}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One category: label always mounted, buttons only once the section nears view. */
function IconSection({
  label,
  icons,
  current,
  onPick,
  forceMount,
  scopeRoot,
}: {
  label: string;
  icons: readonly IconName[];
  current: IconName | null;
  onPick: (icon: IconName) => void;
  forceMount: boolean;
  scopeRoot: { current: HTMLDivElement | null };
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || forceMount) return;
    const element = ref.current;
    if (element === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { root: scopeRoot.current, rootMargin: "300px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, forceMount, scopeRoot]);

  const rows = Math.ceil(icons.length / ICON_COLUMNS);

  return (
    <section ref={ref} className="pb-1">
      <p className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      {visible || forceMount ? (
        <div
          role="group"
          aria-label={label}
          className="grid grid-cols-8 gap-0.5 max-md:pointer-coarse:grid-cols-6"
        >
          {icons.map((name) => (
            <button
              key={name}
              type="button"
              data-icon-choice=""
              aria-label={name}
              title={name}
              aria-pressed={current === name}
              onClick={() => onPick(name)}
              className={cn(
                "flex size-7 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:pointer-coarse:size-10",
                current === name && "bg-accent text-foreground",
              )}
            >
              <Icon name={name} aria-hidden="true" className="size-4 max-md:pointer-coarse:size-5" strokeWidth={2} />
            </button>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" style={{ height: rows * ICON_ROW_HEIGHT }} />
      )}
    </section>
  );
}
