import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * The one row every section heading wears (Pinned, a project, an age bucket, a
 * status, a folder, Chats): a small muted label and a disclosure that folds it.
 * Section headings never carry their own controls; the toolbar above the list
 * owns those.
 */
export const SECTION_HEADING_ROW =
  "cs-heading group/section flex min-h-7 items-center gap-1 rounded py-1 pl-3 pr-1.5 max-md:min-h-9 pointer-coarse:min-h-9";

/** The one label style every section heading shares. */
export const SECTION_HEADING_LABEL =
  "min-w-0 truncate text-xs font-medium text-sidebar-foreground/73";

/** The disclosure chevron: hidden until the heading is hovered on a pointer. */
export const SECTION_HEADING_CHEVRON =
  "size-3.5 shrink-0 text-sidebar-foreground/73 opacity-0 transition-transform duration-150 ease-out motion-reduce:transition-none group-hover/section:opacity-100 group-has-[:focus-visible]/section:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100";

/** One collapsible heading, the same in every grouping. */
export function SectionHeading({
  label,
  open,
  onToggle,
  shelfKey,
  icon,
  className,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  shelfKey?: string;
  /** The heading's own glyph, when it has one (a project or folder keeps its own). */
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={cn(SECTION_HEADING_ROW, className)}>
      <button
        type="button"
        data-shelf-toggle={shelfKey}
        aria-label={label}
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9"
      >
        {icon ? (
          <Icon name={icon} aria-hidden="true" strokeWidth={2} className="size-3.5 shrink-0" />
        ) : null}
        <span className={SECTION_HEADING_LABEL}>{label}</span>
        <Icon
          name="ChevronRight"
          aria-hidden="true"
          className={cn(SECTION_HEADING_CHEVRON, open && "rotate-90")}
        />
      </button>
    </div>
  );
}

/** A fixed heading for the generated ordinary groups (age, status, environment). */
export function SectionDivider({ label, open, onToggle, shelfKey }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  /** Stable key for the fold assertion the view controller reads. */
  shelfKey?: string;
}) {
  return <SectionHeading label={label} open={open} onToggle={onToggle} shelfKey={shelfKey} />;
}
