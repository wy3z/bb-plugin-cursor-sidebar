import { experimental_useRpcKeyedQuery } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { githubPrStatus, PRESENTATION } from "./PullRequestMark";

const lineStats = z.object({
  lineStatsComplete: z.boolean(),
  insertions: z.number(),
  deletions: z.number(),
  fileCount: z.number(),
});

const availableStatus = z.object({
  outcome: z.literal("available"),
  workspace: z.object({
    workingTree: lineStats.extend({ hasUncommittedChanges: z.boolean() }),
    branch: z.object({
      currentBranch: z.string().nullable(),
      defaultBranch: z.string(),
    }),
    mergeBase: lineStats
      .extend({
        mergeBaseBranch: z.string(),
        aheadCount: z.number(),
        behindCount: z.number(),
        commits: z.array(z.object({ shortSha: z.string(), subject: z.string() })),
      })
      .nullable(),
  }),
});

const gitStatus = {
  status: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(z.string(), z.unknown()),
  },
} as const;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function LineStats({
  insertions,
  deletions,
  lineStatsComplete,
}: {
  insertions: number;
  deletions: number;
  lineStatsComplete: boolean;
}) {
  if (!lineStatsComplete && insertions === 0 && deletions === 0) return null;
  return (
    <span className="ml-auto shrink-0 font-mono tabular-nums">
      <span className="text-success">+{insertions}</span>{" "}
      <span className="text-destructive">−{deletions}</span>
      {lineStatsComplete ? null : "+"}
    </span>
  );
}

function Line({
  icon,
  iconClassName,
  children,
  detail,
}: {
  icon: IconName;
  iconClassName?: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-start gap-2">
      <Icon name={icon} className={cn("mt-px size-3.5 shrink-0", iconClassName ?? "opacity-70")} />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="flex min-w-0 items-baseline gap-2 text-foreground/85">{children}</span>
        {detail ? <span className="block truncate opacity-75">{detail}</span> : null}
      </span>
    </li>
  );
}

export function ThreadGitFacts({
  environmentId,
  fallbackBranch,
}: {
  environmentId: string | null;
  fallbackBranch: string | null;
}) {
  const keys = environmentId === null ? [] : [environmentId];
  const git = experimental_useRpcKeyedQuery({
    pluginId: "bb--git",
    contract: gitStatus,
    method: "status",
    keys,
  });
  const pr = experimental_useRpcKeyedQuery({
    pluginId: "bb--github-pr-status",
    contract: githubPrStatus,
    method: "pullRequests",
    keys,
  });

  const gitRow = environmentId === null ? undefined : git.data?.[environmentId];
  const parsedGit = availableStatus.safeParse(gitRow);
  const workspace = parsedGit.success ? parsedGit.data.workspace : null;
  const prRow = environmentId === null ? undefined : pr.data?.[environmentId];
  const pullRequest = prRow?.outcome === "available" ? prRow.pullRequest : null;

  const branch = workspace?.branch.currentBranch ?? fallbackBranch;
  const base = workspace?.mergeBase ?? null;
  const tree = workspace?.workingTree ?? null;
  const latest = base?.commits.at(-1) ?? null;

  if (branch === null && workspace === null && pullRequest === null) return null;

  const prPresentation = pullRequest ? PRESENTATION[pullRequest.state] : null;
  const prFailing =
    pullRequest?.attention === "checks_failed" &&
    pullRequest.state !== "merged" &&
    pullRequest.state !== "closed";

  return (
    <ul className="grid gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
      {branch !== null ? (
        <Line icon="GitBranch">
          <span className="min-w-0 truncate font-mono">{branch}</span>
          {base !== null && (base.aheadCount > 0 || base.behindCount > 0) ? (
            <span className="ml-auto shrink-0 tabular-nums opacity-75">
              ↑{base.aheadCount} ↓{base.behindCount} {base.mergeBaseBranch}
            </span>
          ) : null}
        </Line>
      ) : null}
      {tree !== null && tree.hasUncommittedChanges ? (
        <Line icon="FilePenLine">
          <span>{plural(tree.fileCount, "uncommitted file")}</span>
          <LineStats {...tree} />
        </Line>
      ) : null}
      {base !== null && base.aheadCount > 0 ? (
        <Line
          icon="FileDiff"
          detail={
            latest ? (
              <>
                <span className="font-mono">{latest.shortSha}</span> {latest.subject}
              </>
            ) : null
          }
        >
          <span>
            {plural(base.aheadCount, "commit")}, {plural(base.fileCount, "file")}
          </span>
          <LineStats {...base} />
        </Line>
      ) : null}
      {workspace !== null && !tree?.hasUncommittedChanges && (base === null || base.aheadCount === 0) ? (
        <Line icon="CircleCheck">
          <span>
            {base === null ? "Working tree clean" : `Clean, nothing ahead of ${base.mergeBaseBranch}`}
          </span>
        </Line>
      ) : null}
      {pullRequest !== null && prPresentation !== null ? (
        <Line
          icon={prPresentation.icon}
          iconClassName={prFailing ? "text-destructive" : prPresentation.tone}
          detail={pullRequest.title}
        >
          <span>#{pullRequest.number}</span>
          <span className="ml-auto shrink-0 opacity-75">
            {pullRequest.state}
            {prFailing ? " · checks failing" : ""}
          </span>
        </Line>
      ) : null}
    </ul>
  );
}
