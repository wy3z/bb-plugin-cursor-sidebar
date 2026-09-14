import { useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { useRowGesture } from "./useRowGesture";

export interface SidebarAction { label: string; run: () => void; destructive?: boolean }

/** One context surface for right-click, keyboard, assistive technology and touch. */
export function SidebarActions({ label, onHold, actions, children }: {
  label: string; onHold?: () => void; actions: readonly SidebarAction[]; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const scope = usePortalScopeProps();
  const gesture = useRowGesture(onHold ?? (() => setOpen(true)), () => setOpen(true));
  return <Popover.Root open={open} onOpenChange={setOpen} modal>
    <Popover.Anchor asChild>
      <div className="ps-gesture-row relative" {...gesture}>
        {children}
        <button ref={trigger} type="button" data-row-action="" aria-label={`Actions for ${label}`}
          aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
          className="ps-accessible-actions sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:right-0 focus-visible:top-0 focus-visible:z-20 focus-visible:rounded focus-visible:bg-popover focus-visible:px-3 focus-visible:py-2 focus-visible:ring-1 focus-visible:ring-ring">
          Actions
        </button>
      </div>
    </Popover.Anchor>
    <Popover.Portal><Popover.Content {...scope} aria-label={`Actions for ${label}`} side="bottom" align="start" sideOffset={4}
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }); }}
      className="ps-context-actions z-50 grid w-64 max-w-[calc(100vw-2rem)] gap-1 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md">
      <p className="truncate px-2 py-1 text-xs text-muted-foreground" title={label}>{label}</p>
      {actions.map(action => <button key={action.label} type="button" onClick={() => { setOpen(false); action.run(); }}
        className={`rounded px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring ${action.destructive ? "text-destructive" : ""}`}>{action.label}</button>)}
      <Popover.Close className="rounded px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring">Cancel</Popover.Close>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
