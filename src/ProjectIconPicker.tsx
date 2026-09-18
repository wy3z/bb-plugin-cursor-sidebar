import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Icon, type IconName } from "@/components/ui/icon";
import { ANCHORED_OVERLAY_MOTION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { PROJECT_ICON_NAMES } from "./project-icons";

/**
 * Anchored glyph palette for one native project. It is a popover rather than a
 * dialog so the heading stays visible while choosing, and it draws the catalog
 * as one grid that the filter narrows in place.
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
  const [query, setQuery] = useState("");
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return PROJECT_ICON_NAMES;
    return PROJECT_ICON_NAMES.filter((name) => name.toLowerCase().includes(needle));
  }, [query]);

  // Roving-ish keyboard access: arrows walk the grid, Home/End jump the ends.
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
          onCloseAutoFocus={(event) => {
            // There is no Popover.Trigger to restore, so a preventDefault with
            // nothing else would drop focus to <body>; hand it to the heading.
            event.preventDefault();
            if (anchor?.isConnected) anchor.focus({ preventScroll: true });
          }}
          className={cn(
            "cs-project-icon-picker z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md",
            ANCHORED_OVERLAY_MOTION,
          )}
        >
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter icons"
            aria-label="Filter icons"
            className="mb-2 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring max-md:py-2.5 pointer-coarse:py-2.5"
          />
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => onPick(null)}
              aria-pressed={current === null}
              className={cn(
                "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:py-2.5 pointer-coarse:py-2.5",
                current === null && "bg-accent",
              )}
            >
              <Icon name="Folder" aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={2} />
              Use default
            </button>
            <div
              role="group"
              aria-label={`Icons for ${projectName}`}
              onKeyDown={onGridKeyDown}
              className="grid grid-cols-8 gap-0.5 max-md:grid-cols-6 pointer-coarse:grid-cols-6"
            >
              {matches.map((name) => (
                <button
                  key={name}
                  type="button"
                  data-icon-choice=""
                  aria-label={name}
                  title={name}
                  aria-pressed={current === name}
                  onClick={() => onPick(name)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:size-10 pointer-coarse:size-10",
                    current === name && "bg-accent text-foreground",
                  )}
                >
                  <Icon name={name} aria-hidden="true" className="size-4 max-md:size-5 pointer-coarse:size-5" strokeWidth={2} />
                </button>
              ))}
            </div>
            {matches.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No icons match.</p>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
