import { useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { Icon } from "@/components/ui/icon";
import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { ANCHORED_OVERLAY_MOTION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import {
  ROW_SWIPE_ACTIVATE_PX,
  useRowGesture,
  type RowSwipeBinding,
} from "./useRowGesture";

export interface SidebarAction { label: string; run: () => void; destructive?: boolean; separatorBefore?: boolean; children?: readonly SidebarAction[] }

const ACTION_ITEM = "rounded px-2.5 py-1 text-left text-sm whitespace-nowrap outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring max-md:py-2.5 pointer-coarse:py-2.5";

function SubmenuItem({ action, scope, onDone }: { action: SidebarAction; scope: ReturnType<typeof usePortalScopeProps>; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerEnter={() => setOpen(true)}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(ACTION_ITEM, "flex items-center justify-between gap-4", open && "bg-accent")}
        >
          <span>{action.label}</span>
          <Icon name="ChevronRight" className="size-3.5 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          {...scope}
          side="right"
          align="start"
          sideOffset={6}
          alignOffset={-6}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          className={cn(
            "cs-context-actions z-50 grid w-auto min-w-44 gap-0.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md",
            ANCHORED_OVERLAY_MOTION,
          )}
        >
          {(action.children ?? []).map((child) => (
            <button
              key={child.label}
              type="button"
              onClick={() => {
                setOpen(false);
                onDone();
                child.run();
              }}
              className={ACTION_ITEM}
            >
              {child.label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One context surface for right-click, keyboard, assistive technology and touch. */
export function SidebarActions({ label, onHold, onReorderStart, actions, swipe, children }: {
  label: string; onHold?: () => void; onReorderStart?: (pointerId: number, clientX: number, clientY: number) => boolean; actions: readonly SidebarAction[]; swipe?: RowSwipeBinding; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const scope = usePortalScopeProps();
  const { gesture, swipeState, reorderArmed } = useRowGesture(onHold ?? (() => setOpen(true)), () => setOpen(true), swipe, onReorderStart);
  const reducedMotion = usePrefersReducedMotion();
  const offset = swipeState?.offset ?? 0;
  const settling = swipeState?.settling ?? false;
  const swiping = offset !== 0;
  const revealed = swiping || settling;
  const direction = swiping ? Math.sign(offset) : (swipeState?.direction ?? 0);
  const armed = Math.abs(offset) >= ROW_SWIPE_ACTIVATE_PX;
  // The side the finger has travelled towards, so its own label, glyph and
  // tone are what the row reveals.
  const side = direction < 0 ? swipe?.left : direction > 0 ? swipe?.right : undefined;
  return <Popover.Root open={open} onOpenChange={setOpen} modal>
    <Popover.Anchor asChild>
      <div
        className={cn("cs-gesture-row relative", reorderArmed && "cs-drag-armed", revealed && "overflow-hidden rounded-md")}
        data-no-sidebar-swipe={swipe !== undefined ? "" : undefined}
        {...gesture}
      >
        {side !== undefined && revealed ? (
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center gap-1.5 px-3 text-xs font-medium transition-opacity duration-200 ease-out motion-reduce:transition-none",
              direction < 0 ? "justify-end" : "justify-start",
              side.destructive
                ? "bg-destructive/10 text-destructive"
                : "bg-sidebar-accent text-foreground",
              settling ? "opacity-0" : armed ? "opacity-100" : "opacity-50",
            )}
          >
            <Icon name={side.icon} className="size-4" />
            {side.label}
          </div>
        ) : null}
        <div
          className={revealed ? "relative rounded-md bg-sidebar" : undefined}
          style={revealed ? {
            transform: `translateX(${offset}px)`,
            transition: settling && !swiping && !reducedMotion
              ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
          } : undefined}
        >
          {children}
        </div>
        <button ref={trigger} type="button" data-row-action="" aria-label={`Actions for ${label}`}
          aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:right-0 focus-visible:top-0 focus-visible:z-20 focus-visible:rounded focus-visible:bg-popover focus-visible:px-3 focus-visible:py-2 focus-visible:ring-1 focus-visible:ring-ring">
          Actions
        </button>
      </div>
    </Popover.Anchor>
    <Popover.Portal><Popover.Content {...scope} aria-label={`Actions for ${label}`} side="bottom" align="start" sideOffset={4}
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        // An editor opened by the action takes focus after commit; a deferred
        // restoration must not yank it back to the trigger and blur-commit.
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
        // An action may have removed the row; focusing a detached node would
        // strand focus on <body>.
        if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
      }}
      className={cn(
        "cs-context-actions z-50 grid w-auto min-w-48 max-w-[calc(100vw-2rem)] gap-0.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md",
        ANCHORED_OVERLAY_MOTION,
      )}>
      {actions.flatMap(action => [
        ...(action.separatorBefore ? [<div key={`${action.label}:separator`} aria-hidden className="mx-2 my-1 h-px bg-border" />] : []),
        action.children ? (
          <SubmenuItem key={action.label} action={action} scope={scope} onDone={() => setOpen(false)} />
        ) : (
          <button key={action.label} type="button" onClick={() => { setOpen(false); action.run(); }}
            className={`${ACTION_ITEM} ${action.destructive ? "text-destructive" : ""}`}>{action.label}</button>
        ),
      ])}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
