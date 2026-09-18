import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ICON_BTN } from "./icon-btn";

/** Distinguishes the two fixed thread sections from native project headings. */
export function SectionDivider({ label, open, onToggle, onNewThread, shelfKey, tools }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onNewThread?: () => void;
  shelfKey?: string;
  /** Trailing heading tools (the Filters menu on the first bucket heading). */
  tools?: ReactNode;
}) {
  return (
    <div className="cs-section-divider cs-heading group/section flex items-center gap-1 pl-3 pr-2 max-md:pointer-coarse:pr-0.5">
      <button
        type="button"
        data-shelf-toggle={shelfKey}
        aria-label={label}
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-0.5 rounded py-1 text-xs font-medium text-sidebar-foreground/73 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9"
      >
        <span>{label}</span>
        <Icon
          name="ChevronRight"
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-sidebar-foreground/73 opacity-0 transition-transform duration-150 ease-out motion-reduce:transition-none group-hover/section:opacity-100 group-focus-within/section:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100",
            open && "rotate-90",
          )}
        />
      </button>
      {onNewThread ? (
        <button
          type="button"
          aria-label={`New thread in ${label}`}
          onClick={onNewThread}
          className={cn(ICON_BTN, "opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100")}
        ><Icon name="MessageSquarePlus" className="size-3.5" /></button>
      ) : null}
      {tools}
    </div>
  );
}
