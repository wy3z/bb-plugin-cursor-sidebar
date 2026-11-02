import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  experimental_Icon as Icon,
  experimental_SidebarNavigationIcon as SidebarNavigationIcon,
  experimental_useSidebarNavigation as useSidebarNavigation,
  type ExperimentalSidebarHeaderProps,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { VIEW_MENU_CONTENT, VIEW_MENU_ITEM } from "./SidebarViewMenu";

/**
 * BB's header row is `div[data-testid="app-sidebar-top-reserve-row"]`
 * (`${testIdPrefix}-sidebar-top-reserve-row` on other sidebars). Its only
 * stable hook is the test id; the plugin header sits in the flex-1
 * `[data-sidebar-header-slot]` child next to BB's own history controls.
 */
const HEADER_ROW_SELECTOR = '[data-testid$="sidebar-top-reserve-row"]';
const COMPACT_NAV_MARKER = "data-cursor-sidebar-compact-nav-control";
/** Marks the one row this header mounted in, never another sidebar's row. */
const COMPACT_NAV_ROW_ATTRIBUTE = "data-cursor-sidebar-compact-nav-row";
/** Same gap BB uses between its own header controls (--bb-chrome-control-gap). */
const CONTROL_GAP = 4;

type HistoryLabel = "Go back" | "Go forward";

const CONTROL_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

interface HistoryState {
  available: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

const EMPTY_HISTORY: HistoryState = {
  available: false,
  canGoBack: false,
  canGoForward: false,
};

/** Compact replaces the navigation list entirely; the header draws its controls. */
export function CompactNavigation() {
  return null;
}

/**
 * Nearest ancestor that holds BB's history controls. Normally the header row
 * itself; the fallback keeps the lookup inside the header instead of matching
 * an unrelated "Go back" button elsewhere in the app.
 */
function findHeaderRow(root: HTMLElement): HTMLElement | null {
  const marked = root.closest<HTMLElement>(HEADER_ROW_SELECTOR);
  if (marked !== null) return marked;

  let node = root.parentElement;
  for (let depth = 0; node !== null && depth < 4; depth += 1) {
    if (
      node.querySelector(
        `button[aria-label="Go back"], button[aria-label="Go forward"]`,
      ) !== null
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function findHistoryButton(
  headerRow: HTMLElement | null,
  label: HistoryLabel,
): HTMLButtonElement | null {
  if (headerRow === null) return null;
  return headerRow.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]:not([${COMPACT_NAV_MARKER}])`,
  );
}

function isHistoryButtonDisabled(button: HTMLButtonElement): boolean {
  return button.disabled || button.getAttribute("aria-disabled") === "true";
}

/** Mount count per header row so a re-mount (or StrictMode double effect) keeps the marker. */
const compactNavRowMounts = new Map<HTMLElement, number>();

export function CompactNavigationHeader({
  width,
  controlSize,
}: ExperimentalSidebarHeaderProps) {
  const state = useSidebarNavigation();
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scope = usePortalScopeProps();

  const newThreadItem = state.items.find(
    (item) => item.action.kind === "new-thread",
  );
  const menuItems = state.items.filter(
    (item) => item.action.kind !== "new-thread",
  );

  const readHistory = useCallback((): HistoryState => {
    const root = rootRef.current;
    const headerRow = root === null ? null : findHeaderRow(root);
    const back = findHistoryButton(headerRow, "Go back");
    const forward = findHistoryButton(headerRow, "Go forward");
    return {
      available: back !== null || forward !== null,
      canGoBack: back !== null && !isHistoryButtonDisabled(back),
      canGoForward: forward !== null && !isHistoryButtonDisabled(forward),
    };
  }, []);

  // Mirror BB's history state. Layout effect keeps the proxies from painting in
  // the disabled state for a frame on first mount.
  useLayoutEffect(() => {
    const publish = (next: HistoryState) => {
      setHistory((previous) =>
        previous.available === next.available &&
        previous.canGoBack === next.canGoBack &&
        previous.canGoForward === next.canGoForward
          ? previous
          : next,
      );
    };

    publish(readHistory());

    const root = rootRef.current;
    const headerRow = root === null ? null : findHeaderRow(root);
    if (headerRow === null) return;

    const observer = new MutationObserver(() => publish(readHistory()));
    observer.observe(headerRow, {
      attributeFilter: ["disabled", "aria-disabled", "aria-label"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [readHistory]);

  // Mark only the exact header row holding this component. Other sidebars
  // (Settings, Plugins) keep their own history buttons, even while BB keeps
  // the app sidebar mounted but hidden behind them.
  useEffect(() => {
    const root = rootRef.current;
    const row = root === null ? null : findHeaderRow(root);
    if (row === null) return;
    compactNavRowMounts.set(row, (compactNavRowMounts.get(row) ?? 0) + 1);
    row.setAttribute(COMPACT_NAV_ROW_ATTRIBUTE, "");
    return () => {
      const remaining = (compactNavRowMounts.get(row) ?? 1) - 1;
      if (remaining > 0) {
        compactNavRowMounts.set(row, remaining);
        return;
      }
      compactNavRowMounts.delete(row);
      row.removeAttribute(COMPACT_NAV_ROW_ATTRIBUTE);
    };
  }, []);

  const goHistory = (label: HistoryLabel) => {
    const root = rootRef.current;
    if (root === null) return;
    // A display:none button still fires onClick through HTMLElement.click().
    findHistoryButton(findHeaderRow(root), label)?.click();
  };

  // Five controls need n buttons and, thanks to the flex-1 spacer, n gaps.
  // Dropped in order: forward, back, then the menu; + always stays.
  const fitsControls = (count: number) =>
    width >= count * controlSize + count * CONTROL_GAP;

  const showForward = history.available && fitsControls(4);
  const showBack = history.available && fitsControls(3);
  const showMenuButton = fitsControls(2);

  return (
    <div
      ref={rootRef}
      className="flex w-full min-w-0 items-center gap-1"
    >
      {showBack ? (
        <button
          type="button"
          aria-label="Go back"
          title="Go back"
          data-cursor-sidebar-compact-nav-control=""
          disabled={!history.canGoBack}
          className={CONTROL_CLASS}
          style={{ width: controlSize, height: controlSize }}
          onClick={() => goHistory("Go back")}
        >
          <Icon name="ChevronLeft" className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      {showForward ? (
        <button
          type="button"
          aria-label="Go forward"
          title="Go forward"
          data-cursor-sidebar-compact-nav-control=""
          disabled={!history.canGoForward}
          className={CONTROL_CLASS}
          style={{ width: controlSize, height: controlSize }}
          onClick={() => goHistory("Go forward")}
        >
          <Icon name="ChevronRight" className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="New thread"
        title="New thread"
        disabled={newThreadItem === undefined || newThreadItem.isDisabled}
        className={CONTROL_CLASS}
        style={{ width: controlSize, height: controlSize }}
        onClick={() => {
          if (newThreadItem !== undefined) {
            state.actions.activate(newThreadItem.id, { target: "current" });
          }
        }}
      >
        <Icon name="Plus" className="size-4" aria-hidden="true" />
      </button>
      <div aria-hidden="true" className="min-w-0 flex-1" />
      {showMenuButton ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Navigation menu"
              title="Navigation menu"
              className={cn(
                CONTROL_CLASS,
                "data-[state=open]:bg-state-active data-[state=open]:text-foreground",
              )}
              style={{ width: controlSize, height: controlSize }}
            >
              <Icon name="MoreHorizontal" className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              {...scope}
              align="end"
              sideOffset={4}
              collisionPadding={8}
              aria-label="Navigation menu"
              className={cn(
                VIEW_MENU_CONTENT,
                "min-w-48 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto",
              )}
            >
              {state.isHomeActive ? null : (
                <DropdownMenu.Item
                  className={VIEW_MENU_ITEM}
                  onSelect={() => state.actions.goHome()}
                >
                  <Icon
                    name="Home"
                    className="size-4 shrink-0 text-muted-foreground/70"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">Back to threads</span>
                </DropdownMenu.Item>
              )}
              {menuItems.map((item) => {
                const isActive = item.id === state.activeItemId;
                return (
                  <DropdownMenu.Item
                    key={item.id}
                    disabled={item.isDisabled || item.isLoading}
                    aria-busy={item.isLoading || undefined}
                    aria-keyshortcuts={item.shortcut?.ariaKeyShortcuts}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      VIEW_MENU_ITEM,
                      isActive && "bg-state-active text-foreground",
                    )}
                    // Activation stays synchronous: the host requires the
                    // select event's user gesture to open a panel or tab.
                    onSelect={() =>
                      state.actions.activate(item.id, { target: "current" })
                    }
                  >
                    <SidebarNavigationIcon
                      icon={item.icon}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.shortcut === null ? null : (
                      <span className="shrink-0 text-subtle-foreground">
                        {item.shortcut.label}
                      </span>
                    )}
                  </DropdownMenu.Item>
                );
              })}
              <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-muted" />
              <DropdownMenu.Item
                className={VIEW_MENU_ITEM}
                onSelect={() => state.actions.openCustomize()}
              >
                <Icon
                  name="SlidersHorizontal"
                  className="size-4 shrink-0 text-muted-foreground/70"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">Customize…</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
    </div>
  );
}
