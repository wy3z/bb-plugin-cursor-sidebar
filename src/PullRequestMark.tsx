import { experimental_useRpcKeyedQuery } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * The bundled GitHub PR Status plugin's `pullRequests` read, copied from
 * references/frontend-pull-requests.md. Keys are environment ids, so rows
 * sharing a worktree share one read.
 *
 * A plain object, not `defineRpcContract`: that lives in the server SDK root,
 * which a clean install does not provide to the frontend bundle.
 */
export const githubPrStatus = {
  pullRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(
      z.string(),
      z.discriminatedUnion("outcome", [
        z.object({
          outcome: z.literal("available"),
          pullRequest: z.object({
            number: z.number(),
            title: z.string(),
            url: z.string(),
            state: z.enum(["draft", "open", "merged", "closed"]),
            attention: z.string(),
          }),
        }),
        z.object({ outcome: z.literal("absent") }),
        z.object({ outcome: z.literal("unavailable"), message: z.string() }),
      ]),
    ),
  },
} as const;

/**
 * The GitLab MR Status plugin's `mergeRequests` read (plugin id
 * `gitlab-mr-status`). Optional: when that plugin is not installed the read
 * fails, which is treated as "no merge request".
 */
export const gitlabMrStatus = {
  mergeRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(
      z.string(),
      z.discriminatedUnion("outcome", [
        z.object({
          outcome: z.literal("available"),
          mergeRequest: z.object({
            iid: z.number(),
            title: z.string(),
            url: z.string(),
            state: z.enum(["draft", "open", "merged", "closed"]),
            attention: z.string(),
          }),
        }),
        z.object({ outcome: z.literal("absent") }),
        z.object({ outcome: z.literal("unavailable"), message: z.string() }),
      ]),
    ),
  },
} as const;

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
export const PRESENTATION: Record<PullRequestState, Presentation> = {
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

export interface ChangeRequest {
  provider: "github" | "gitlab";
  /** "#12" for a GitHub pull request, "!12" for a GitLab merge request. */
  ref: string;
  title: string;
  state: PullRequestState;
  /** Checks (GitHub) or the pipeline (GitLab) are failing. */
  failing: boolean;
  /** "pull request" or "merge request". */
  noun: string;
}

/**
 * The environment's GitHub pull request, else its GitLab merge request. Both
 * come from plugins that own the polling and staleness rules; a query error
 * (including the GitLab plugin not being installed), `absent` and
 * `unavailable` all mean "nothing to show", never an error. The GitLab read
 * only runs while there is no GitHub pull request.
 */
export function useChangeRequest(environmentId: string | null): ChangeRequest | null {
  const keys = environmentId === null ? [] : [environmentId];
  const github = experimental_useRpcKeyedQuery({
    pluginId: "bb--github-pr-status",
    contract: githubPrStatus,
    method: "pullRequests",
    keys,
  });
  const githubRow = environmentId === null ? undefined : github.data?.[environmentId];
  const hasPullRequest = githubRow?.outcome === "available";
  const gitlab = experimental_useRpcKeyedQuery({
    pluginId: "gitlab-mr-status",
    contract: gitlabMrStatus,
    method: "mergeRequests",
    keys: hasPullRequest ? [] : keys,
  });
  if (githubRow?.outcome === "available") {
    const { number, title, state, attention } = githubRow.pullRequest;
    return {
      provider: "github",
      ref: `#${number}`,
      title,
      state,
      failing: attention === "checks_failed" && state !== "merged" && state !== "closed",
      noun: "pull request",
    };
  }
  const gitlabRow = environmentId === null ? undefined : gitlab.data?.[environmentId];
  if (gitlabRow?.outcome === "available") {
    const { iid, title, state, attention } = gitlabRow.mergeRequest;
    return {
      provider: "gitlab",
      ref: `!${iid}`,
      title,
      state,
      failing: attention === "pipeline_failed" && state !== "merged" && state !== "closed",
      noun: "merge request",
    };
  }
  return null;
}

export function PullRequestMark({ environmentId }: { environmentId: string | null }) {
  const request = useChangeRequest(environmentId);
  if (request === null) return null;

  const presentation = PRESENTATION[request.state];
  const label = presentation.label.replace("pull request", request.noun);
  const full = request.failing
    ? `${label}, ${request.provider === "gitlab" ? "pipeline" : "checks"} failing`
    : label;

  return (
    <span
      role="img"
      aria-label={full}
      title={`${request.ref} · ${full.toLowerCase()}`}
      className="mr-1 flex size-3.5 shrink-0 items-center justify-center"
    >
      <Icon
        name={presentation.icon}
        className={cn("size-3.5", request.failing ? "text-destructive" : presentation.tone)}
      />
    </span>
  );
}
