import { CONVERSATION_PAGE_SIZE } from "./conversations";

/** Reveal another page of inactive conversations under a project or group. */
export function ShowMoreButton({
  hiddenConversations,
  onShowMore,
  ariaLabel,
}: {
  hiddenConversations: number;
  onShowMore: () => void;
  ariaLabel?: string;
}) {
  if (hiddenConversations <= 0) return null;
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? `Show ${Math.min(CONVERSATION_PAGE_SIZE, hiddenConversations)} more conversations`}
      onClick={onShowMore}
      className="ps-more-conversations flex min-h-8 w-full items-center rounded py-1 pl-6 pr-2 text-left text-2xs text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/73 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9"
    >
      <span className="truncate">{`Show more (${hiddenConversations})`}</span>
    </button>
  );
}
