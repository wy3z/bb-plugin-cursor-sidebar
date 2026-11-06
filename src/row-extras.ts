import { toast } from "sonner";
import { z } from "zod";
import {
  experimental_copyToClipboard,
  experimental_saveFile,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { threadDisplayTitle } from "./inbox";

type Sdk = {
  plugins: { callRpc: (args: never) => Promise<unknown> };
  threads: {
    fork: (args: never) => Promise<{ id: string }>;
    archive: (args: { threadId: string }) => Promise<unknown>;
  };
};

const transcriptOutput = z.object({ text: z.string() });
const prStatusOutput = z.record(z.string(), z.unknown());

async function copy(text: string, what: string) {
  const ok = await experimental_copyToClipboard({ text });
  if (ok) toast.success(`Copied ${what}`);
  else toast.error(`Couldn't copy ${what}`);
}

async function fetchTranscript(sdk: Sdk, threadId: string): Promise<string> {
  const result = (await sdk.plugins.callRpc({
    pluginId: "cursor-sidebar",
    method: "transcript",
    input: { threadId },
    outputSchema: transcriptOutput,
  } as never)) as z.infer<typeof transcriptOutput>;
  return result.text;
}

export async function copyThreadLink(thread: PluginSidebarThread) {
  await copy(new URL(thread.href, window.location.origin).toString(), "link");
}

export async function copyBranch(thread: PluginSidebarThread) {
  const branch = thread.environment?.branchName;
  if (!branch) {
    toast.error("This thread has no branch");
    return;
  }
  await copy(branch, "branch name");
}

export async function copyPullRequestLink(sdk: Sdk, thread: PluginSidebarThread) {
  const environmentId = thread.environment?.id;
  if (!environmentId) {
    toast.error("This thread has no environment");
    return;
  }
  try {
    const result = (await sdk.plugins.callRpc({
      pluginId: "bb--github-pr-status",
      method: "pullRequests",
      input: { keys: [environmentId] },
      outputSchema: prStatusOutput,
    } as never)) as Record<string, { outcome?: string; pullRequest?: { url?: unknown } }>;
    const row = result[environmentId];
    const url = row?.outcome === "available" && typeof row.pullRequest?.url === "string" ? row.pullRequest.url : null;
    if (!url) {
      toast.error("No pull request for this thread's branch");
      return;
    }
    await copy(url, "pull request link");
  } catch (error) {
    toast.error("Couldn't read the pull request", { description: error instanceof Error ? error.message : String(error) });
  }
}

export async function copyTranscript(sdk: Sdk, thread: PluginSidebarThread) {
  try {
    await copy(await fetchTranscript(sdk, thread.id), "transcript");
  } catch (error) {
    toast.error("Couldn't read the transcript", { description: error instanceof Error ? error.message : String(error) });
  }
}

export async function exportTranscript(sdk: Sdk, thread: PluginSidebarThread) {
  try {
    const text = await fetchTranscript(sdk, thread.id);
    const name = threadDisplayTitle(thread).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || thread.id;
    await experimental_saveFile({ fileName: `${name}.md`, blob: new Blob([text], { type: "text/markdown" }) });
  } catch (error) {
    toast.error("Couldn't export the transcript", { description: error instanceof Error ? error.message : String(error) });
  }
}

export async function forkThread(sdk: Sdk, thread: PluginSidebarThread, open: (threadId: string) => void) {
  try {
    const forked = await sdk.threads.fork({ sourceThreadId: thread.id } as never);
    toast.success("Forked");
    open(forked.id);
  } catch (error) {
    toast.error("Couldn't fork the thread", { description: error instanceof Error ? error.message : String(error) });
  }
}

export function rowsBelow(threadId: string): string[] {
  const row = document.querySelector<HTMLElement>(`[data-thread-row-id="${CSS.escape(threadId)}"]`);
  const list = row?.closest(".cs-managers, section, [data-cursor-sidebar-root]") ?? null;
  if (!row || !list) return [];
  const all = Array.from(list.querySelectorAll<HTMLElement>("[data-thread-row-id]"));
  const index = all.indexOf(row);
  return all.slice(index + 1).map((element) => element.dataset.threadRowId!).filter(Boolean);
}

export async function archiveMany(
  sdk: Sdk,
  candidates: readonly PluginSidebarThread[],
  label: string,
): Promise<void> {
  const targets = candidates.filter((thread) => !thread.isArchived && !thread.isPinned && thread.status !== "active" && thread.status !== "starting");
  if (targets.length === 0) {
    toast.info("Nothing to archive");
    return;
  }
  const skipped = candidates.length - targets.length;
  const ok = window.confirm(
    `Archive ${targets.length} ${targets.length === 1 ? "thread" : "threads"} ${label}?` +
      (skipped > 0 ? `\n\n${skipped} pinned or working ${skipped === 1 ? "thread is" : "threads are"} left alone.` : "") +
      "\n\nArchived threads can be restored from Archived.",
  );
  if (!ok) return;
  const results = await Promise.allSettled(targets.map((thread) => sdk.threads.archive({ threadId: thread.id })));
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed > 0) toast.error(`Archived ${targets.length - failed} of ${targets.length}`, { description: `${failed} could not be archived.` });
  else toast.success(`Archived ${targets.length} ${targets.length === 1 ? "thread" : "threads"}`);
}

export async function copyThreadId(thread: PluginSidebarThread) {
  await copy(thread.id, "thread ID");
}
