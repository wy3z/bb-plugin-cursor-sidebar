import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { Icon, type IconName } from "@/components/ui/icon";
import { ANCHORED_OVERLAY_MOTION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

const OPEN_DELAY_MS = 600;
const WARM_WINDOW_MS = 400;

let lastClosedAt = 0;
let activeOwner: symbol | null = null;

export interface ThreadHoverFact {
  icon: IconName;
  glyph?: ReactNode;
  text: string;
  detail?: string | null;
}

export function ThreadHoverCard({
  disabled,
  title,
  status,
  facts,
  extra,
  children,
}: {
  disabled: boolean;
  title: string;
  status: ReactNode;
  facts: readonly ThreadHoverFact[];
  extra?: ReactNode;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const owner = useRef(Symbol("thread-hover"));
  const timer = useRef<number | null>(null);
  const via = useRef<"pointer" | "focus" | null>(null);
  const detach = useRef<(() => void) | null>(null);
  const scope = usePortalScopeProps();

  const close = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    detach.current?.();
    detach.current = null;
    via.current = null;
    if (activeOwner === owner.current) {
      activeOwner = null;
      lastClosedAt = Date.now();
    }
    setOpen(false);
  }, []);

  const arm = useCallback(
    (source: "pointer" | "focus", delay: number) => {
      close();
      via.current = source;
      const dismiss = () => close();
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" || via.current === "pointer") close();
      };
      window.addEventListener("wheel", dismiss, { passive: true, capture: true });
      window.addEventListener("scroll", dismiss, { passive: true, capture: true });
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("blur", dismiss);
      detach.current = () => {
        window.removeEventListener("wheel", dismiss, true);
        window.removeEventListener("scroll", dismiss, true);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("blur", dismiss);
      };
      const show = () => {
        timer.current = null;
        activeOwner = owner.current;
        setOpen(true);
      };
      if (delay === 0) show();
      else timer.current = window.setTimeout(show, delay);
    },
    [close],
  );

  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);

  useEffect(() => close, [close]);

  const onPointerEnter = (event: ReactPointerEvent<HTMLElement>) => {
    if (disabled || event.pointerType !== "mouse" || event.buttons !== 0) return;
    const warm = activeOwner !== null || Date.now() - lastClosedAt < WARM_WINDOW_MS;
    arm("pointer", warm ? 0 : OPEN_DELAY_MS);
  };

  const onFocus = (event: ReactFocusEvent<HTMLElement>) => {
    if (disabled || !(event.target instanceof HTMLElement)) return;
    if (!event.target.matches("[data-thread-focus-id]:focus-visible")) return;
    arm("focus", 0);
  };

  const onBlur = (event: ReactFocusEvent<HTMLElement>) => {
    if (via.current === "focus" && !event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  };

  return (
    <Popover.Root open={open && !disabled} onOpenChange={(next) => (next ? undefined : close())}>
      <Popover.Anchor
        asChild
        onPointerEnter={onPointerEnter}
        onPointerLeave={() => {
          if (via.current === "pointer") close();
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onPointerDownCapture={close}
        onContextMenuCapture={close}
      >
        {children}
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          {...scope}
          side="right"
          align="start"
          sideOffset={10}
          alignOffset={-4}
          collisionPadding={8}
          avoidCollisions
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          role="tooltip"
          className={cn(
            "cs-thread-hover pointer-events-none z-50 grid w-72 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-md",
            ANCHORED_OVERLAY_MOTION,
          )}
        >
          <div className="text-sm font-medium leading-snug [overflow-wrap:anywhere]">
            {title}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">{status}</div>
          {facts.length > 0 ? (
            <ul className="grid gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
              {facts.map((fact) => (
                <li key={`${fact.icon}:${fact.text}`} className="flex min-w-0 items-start gap-2">
                  {fact.glyph ? (
                    <span className="mt-px flex size-3.5 shrink-0 items-center justify-center">{fact.glyph}</span>
                  ) : (
                    <Icon name={fact.icon} className="mt-px size-3.5 shrink-0 opacity-70" />
                  )}
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="text-foreground/85">{fact.text}</span>
                    {fact.detail ? (
                      <span className="block font-mono text-2xs opacity-75">{fact.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {extra}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
