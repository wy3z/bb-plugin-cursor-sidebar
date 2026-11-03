/** Reveal another page of inactive conversations under a project or group. */
export function ShowMoreButton({
  hiddenConversations,
  pageSize,
  onShowMore,
  ariaLabel,
}: {
  hiddenConversations: number;
  /** The view's "Threads per group" page the reveal adds. */
  pageSize: number;
  onShowMore: () => void;
  ariaLabel?: string;
}) {
  if (hiddenConversations <= 0) return null;
  const label = `Show ${Math.min(pageSize, hiddenConversations)} more`;
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? `${label} conversations`}
      onClick={onShowMore}
      className="cs-more-conversations flex min-h-8 w-full items-center rounded py-1 pl-7 pr-2 text-left text-2xs text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/73 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring max-md:min-h-9 pointer-coarse:min-h-9"
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
