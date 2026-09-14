import { Icon } from "@/components/ui/icon";

/** Distinguishes the two fixed thread sections from native project headings. */
export function SectionDivider({ label, open, onToggle, onNewThread, shelfKey, title }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onNewThread?: () => void;
  shelfKey?: string;
  title?: string;
}) {
  return (
    <div className="group/section flex items-center gap-1 pl-3 pr-1.5">
      <button
        type="button"
        data-shelf-toggle={shelfKey}
        aria-label={label}
        aria-expanded={open}
        title={title}
        onClick={onToggle}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-1 rounded py-0.5 text-xs font-medium text-muted-foreground/55 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:min-h-9"
      >
        <span>{label}</span>
      </button>
      {onNewThread ? (
        <button
          type="button"
          aria-label={`New thread in ${label}`}
          onClick={onNewThread}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:pointer-coarse:size-9 max-md:pointer-coarse:opacity-100"
        ><Icon name="Plus" className="size-3.5" /></button>
      ) : null}
    </div>
  );
}
