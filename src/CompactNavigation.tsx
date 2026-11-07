import {
  experimental_Icon as Icon,
  experimental_SidebarNavigationIcon as SidebarNavigationIcon,
  experimental_useSidebarNavigation as useSidebarNavigation,
  type ExperimentalSidebarFooterDisclosureProps,
  type ExperimentalSidebarHeaderProps,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

/** Same gap BB uses between its own header controls (--bb-chrome-control-gap). */
const CONTROL_GAP = 4;

const CONTROL_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const MENU_ITEM =
  "flex min-h-7 w-full cursor-pointer select-none items-center gap-2 rounded px-2 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50";

/** Compact replaces the navigation list entirely; the header draws its controls. */
export function CompactNavigation() {
  return null;
}

/**
 * Search and New thread on the left of the header row. BB's own sidebar
 * toggle sits in its fixed overlay to the left of this slot and BB's own
 * back/forward buttons sit to the right of it, so neither is drawn here.
 */
export function CompactNavigationHeader({
  width,
  controlSize,
}: ExperimentalSidebarHeaderProps) {
  const state = useSidebarNavigation();

  const newThreadItem = state.items.find(
    (item) => item.action.kind === "new-thread",
  );
  const searchItem = state.items.find(
    (item) => item.action.kind === "search-threads",
  );

  const fitsControls = (count: number) =>
    width >= count * controlSize + (count - 1) * CONTROL_GAP;

  const showSearch = searchItem !== undefined && fitsControls(2);

  const activate = (id: string | undefined) => {
    if (id !== undefined) state.actions.activate(id, { target: "current" });
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      {showSearch ? (
        <button
          type="button"
          aria-label={searchItem.label}
          title={searchItem.label}
          aria-keyshortcuts={searchItem.shortcut?.ariaKeyShortcuts}
          disabled={searchItem.isDisabled}
          className={CONTROL_CLASS}
          style={{ width: controlSize, height: controlSize }}
          onClick={() => activate(searchItem.id)}
        >
          <Icon name="Search" className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="New thread"
        title="New thread"
        aria-keyshortcuts={newThreadItem?.shortcut?.ariaKeyShortcuts}
        disabled={newThreadItem === undefined || newThreadItem.isDisabled}
        className={CONTROL_CLASS}
        style={{ width: controlSize, height: controlSize }}
        onClick={() => activate(newThreadItem?.id)}
      >
        <Icon name="Sent" className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The footer "Plugins" disclosure: every navigation destination the header
 * does not draw, plus Back to threads and Customize.
 */
export function CompactNavigationFooter({
  dismiss,
}: ExperimentalSidebarFooterDisclosureProps) {
  const state = useSidebarNavigation();

  const menuItems = state.items.filter(
    (item) =>
      item.action.kind !== "new-thread" &&
      item.action.kind !== "search-threads",
  );

  return (
    <div className="flex flex-col p-1">
      {state.isHomeActive ? null : (
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            state.actions.goHome();
            dismiss();
          }}
        >
          <Icon
            name="Home"
            className="size-4 shrink-0 text-muted-foreground/70"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">Back to threads</span>
        </button>
      )}
      {menuItems.map((item) => {
        const isActive = item.id === state.activeItemId;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.isDisabled || item.isLoading}
            aria-busy={item.isLoading || undefined}
            aria-keyshortcuts={item.shortcut?.ariaKeyShortcuts}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              MENU_ITEM,
              isActive && "bg-state-active text-foreground",
            )}
            onClick={() => {
              state.actions.activate(item.id, { target: "current" });
              dismiss();
            }}
          >
            <SidebarNavigationIcon icon={item.icon} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut === null ? null : (
              <span className="shrink-0 text-subtle-foreground">
                {item.shortcut.label}
              </span>
            )}
          </button>
        );
      })}
      <div className="my-1 h-px bg-muted" />
      <button
        type="button"
        className={MENU_ITEM}
        onClick={() => {
          state.actions.openCustomize();
          dismiss();
        }}
      >
        <Icon
          name="SlidersHorizontal"
          className="size-4 shrink-0 text-muted-foreground/70"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">Customize…</span>
      </button>
    </div>
  );
}
