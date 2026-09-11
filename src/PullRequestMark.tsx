import {
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type PullRequestState = "open" | "draft" | "merged" | "closed";

interface Presentation {
  icon: IconName;
  tone: string;
  label: string;
}

/**
 * The leading mark for a real pull request, in Dray's open/draft/merged/closed
 * vocabulary. A failing check recolours the mark rather than adding a second
 * one: a broken build is a fact about this PR, and a merged or closed PR's
 * checks are history. No PR means no mark — nothing is fabricated.
 */
const PRESENTATION: Record<PullRequestState, Presentation> = {
  open: { icon: "GitPullRequest", tone: "text-success", label: "Open pull request" },
  draft: {
    icon: "GitPullRequestDraft",
    tone: "text-muted-foreground",
    label: "Draft pull request",
  },
  merged: { icon: "GitMerge", tone: "text-pr-merged", label: "Merged pull request" },
  closed: {
    icon: "GitPullRequestClosed",
    tone: "text-destructive",
    label: "Closed pull request",
  },
};

/**
 * Reads the host's cached pull-request state for one thread. The lookup is
 * per-row and host-owned (threads sharing an environment share one query), so
 * the sidebar never shells out to Git for the whole list.
 */
export function PullRequestMark({ threadId }: { threadId: string }) {
  const { pullRequest } = useSidebarThreadPullRequest(threadId);
  if (pullRequest === null) return null;

  const presentation = PRESENTATION[pullRequest.state];
  const failing =
    pullRequest.attention === "checks_failed" &&
    pullRequest.state !== "merged" &&
    pullRequest.state !== "closed";
  const label = failing ? `${presentation.label}, checks failing` : presentation.label;

  return (
    <span
      role="img"
      aria-label={label}
      title={`#${pullRequest.number} · ${label.toLowerCase()}`}
      className="mr-1 flex size-3.5 shrink-0 items-center justify-center"
    >
      <Icon
        name={presentation.icon}
        className={cn("size-3.5", failing ? "text-destructive" : presentation.tone)}
      />
    </span>
  );
}
