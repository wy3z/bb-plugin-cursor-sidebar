import type { CoreAttentionEntry } from "./status";

/**
 * Where a Core heading's secondary action navigates. Pure and SDK-free so the
 * exact destination and the label the button shows are exercised directly.
 */
export type HeadingAction =
  | { kind: "thread"; threadId: string; title: string }
  | { kind: "core"; title: string };

/**
 * The hidden threads a reveal action can open directly: the exact unresolved
 * attention entries whose native thread the sidebar still carries, so a real
 * row exists to navigate to. An absent generation has no native thread and is
 * not reachable this way.
 */
export function reachableRevealTargets(
  entries: readonly CoreAttentionEntry[],
  hasNativeThread: (threadId: string) => boolean,
  hiddenThreadIds: ReadonlySet<string>,
): string[] {
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.threadId)) continue;
    if (!hiddenThreadIds.has(entry.threadId)) continue;
    if (!hasNativeThread(entry.threadId)) continue;
    seen.add(entry.threadId);
    targets.push(entry.threadId);
  }
  return targets;
}

/**
 * The reveal action for archived/absent attention. A reachable hidden thread is
 * opened directly through the supported thread route; when every target is an
 * absent generation the Core itself is the destination. The title states
 * exactly what opens, so the label is never a fake view claim.
 */
export function planAttentionReveal(reachableThreadIds: readonly string[]): HeadingAction {
  const first = reachableThreadIds[0];
  if (first !== undefined) {
    return { kind: "thread", threadId: first, title: "Open a hidden unresolved thread" };
  }
  return { kind: "core", title: "Open the Core for unresolved work" };
}

/**
 * Listening has no cross-plugin view route: the SDK only navigates a plugin's
 * own panels (`toPluginPanel`, `openThreadPanel`, `openFixedTab` are all scoped
 * to the calling plugin). The honest destination is the Core thread, whose
 * workspace carries the Listening tab, so the title says that instead of
 * claiming it opens the view.
 */
export function planListeningAction(): HeadingAction {
  return {
    kind: "core",
    title: "Open the Core (Listening status shows in its workspace)",
  };
}
