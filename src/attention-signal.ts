/**
 * The native feed facts that can change a Core's attention: activity time, the
 * newest attention timestamp, a pending interaction and the indicator. The
 * host's own sidebar view updates on exactly these, so this signature is the
 * existing native signal a bounded attention refresh rides; no timer is
 * introduced. Two feeds with the same signature carry the same facts.
 *
 * Pure and dependency-free so the refresh trigger is testable on its own.
 */
export interface AttentionFeedThread {
  id: string;
  updatedAt: number;
  latestAttentionAt: number;
  hasPendingInteraction: boolean;
  indicator: string;
}

export function nativeAttentionSignature(
  threads: readonly AttentionFeedThread[],
): string {
  return threads
    .map(
      (thread) =>
        `${thread.id}:${thread.updatedAt}:${thread.latestAttentionAt}:${thread.hasPendingInteraction}:${thread.indicator}`,
    )
    .join("\u0000");
}
