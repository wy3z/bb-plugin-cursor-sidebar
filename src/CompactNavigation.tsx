import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  experimental_Icon as Icon,
  experimental_SidebarNavigationIcon as SidebarNavigationIcon,
  experimental_useSidebarNavigation as useSidebarNavigation,
  type ExperimentalSidebarHeaderProps,
} from "@get-bb/plugin-sdk/app";

const MENU_MIN_WIDTH = 200;
const MENU_GAP = 4;

/**
 * BB's header row is `div[data-testid="app-sidebar-top-reserve-row"]`
 * (`${testIdPrefix}-sidebar-top-reserve-row` on other sidebars). Its only
 * stable hook is the test id; the plugin header sits in the flex-1
 * `[data-sidebar-header-slot]` child next to BB's own history controls.
 */
const HEADER_ROW_SELECTOR = '[data-testid$="sidebar-top-reserve-row"]';
const COMPACT_NAV_MARKER = "data-cursor-sidebar-compact-nav-control";
const COMPACT_NAV_ROOT_ATTRIBUTE = "data-cursor-sidebar-compact-nav";
/** Same gap BB uses between its own header controls (--bb-chrome-control-gap). */
const CONTROL_GAP = 4;

type HistoryLabel = "Go back" | "Go forward";

const CONTROL_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const ROW_CLASS =
  "flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-[0.3125rem] text-left text-xs outline-none hover:bg-state-hover focus:bg-state-hover focus:text-foreground disabled:pointer-events-none disabled:opacity-50";

interface MenuPosition {
  top: number;
  left: number;
}

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

/** Mount count so a re-mount (or StrictMode double effect) keeps the marker. */
let compactNavMounts = 0;

export function CompactNavigationHeader({
  width,
  controlSize,
}: ExperimentalSidebarHeaderProps) {
  const state = useSidebarNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const newThreadItem = state.items.find(
    (item) => item.action.kind === "new-thread",
  );
  const menuItems = state.items.filter(
    (item) => item.action.kind !== "new-thread",
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setPosition(null);
  }, []);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (button === null) return;
    const rect = button.getBoundingClientRect();
    setPosition({
      top: rect.bottom + MENU_GAP,
      left: Math.max(
        8,
        Math.min(rect.left, window.innerWidth - MENU_MIN_WIDTH - 8),
      ),
    });
  }, []);

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

  // Hide BB's own back/forward only while this header is mounted; the proxies
  // click the hidden buttons, which keeps BB's behaviour and shortcuts intact.
  useEffect(() => {
    compactNavMounts += 1;
    document.documentElement.setAttribute(COMPACT_NAV_ROOT_ATTRIBUTE, "true");
    return () => {
      compactNavMounts = Math.max(0, compactNavMounts - 1);
      if (
        compactNavMounts === 0 &&
        document.documentElement.getAttribute(COMPACT_NAV_ROOT_ATTRIBUTE) ===
          "true"
      ) {
        document.documentElement.removeAttribute(COMPACT_NAV_ROOT_ATTRIBUTE);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) === true) return;
      if (buttonRef.current?.contains(target) === true) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
      buttonRef.current?.focus();
    };

    updatePosition();
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, close, updatePosition]);

  const activate = (itemId: string) => {
    close();
    state.actions.activate(itemId, { target: "current" });
  };

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
        <button
          ref={buttonRef}
          type="button"
          aria-label="Navigation menu"
          title="Navigation menu"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          data-state={isOpen ? "open" : "closed"}
          className={`${CONTROL_CLASS}${isOpen ? " bg-state-active text-foreground" : ""}`}
          style={{ width: controlSize, height: controlSize }}
          onClick={() => {
            if (isOpen) {
              close();
            } else {
              setIsOpen(true);
            }
          }}
        >
          <Icon name="MoreHorizontal" className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      {isOpen && position !== null
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Navigation menu"
              className="fixed z-50 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
              style={{
                top: position.top,
                left: position.left,
                minWidth: MENU_MIN_WIDTH,
              }}
            >
              {state.isHomeActive ? null : (
                <button
                  type="button"
                  role="menuitem"
                  className={ROW_CLASS}
                  onClick={() => {
                    close();
                    state.actions.goHome();
                  }}
                >
                  <Icon name="Home" className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">Back to threads</span>
                </button>
              )}
              {menuItems.map((item) => {
                const isActive = item.id === state.activeItemId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.isDisabled || item.isLoading}
                    aria-busy={item.isLoading || undefined}
                    aria-keyshortcuts={item.shortcut?.ariaKeyShortcuts}
                    aria-current={isActive ? "page" : undefined}
                    className={`${ROW_CLASS}${isActive ? " bg-state-active text-foreground" : ""}`}
                    onClick={() => activate(item.id)}
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
                  </button>
                );
              })}
              <div role="separator" className="-mx-1 my-1 h-px bg-muted" />
              <button
                type="button"
                role="menuitem"
                className={ROW_CLASS}
                onClick={() => {
                  close();
                  state.actions.openCustomize();
                }}
              >
                <Icon
                  name="SlidersHorizontal"
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">Customize…</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
