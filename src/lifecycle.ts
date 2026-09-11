/**
 * The settled lifecycle, as pure functions over stored rows.
 *
 * Settling is the only lifecycle concept this add-on owns. Snooze was removed
 * by the current UI revision; the store keeps its old columns inert, and old
 * snoozed records are migrated to active on load.
 *
 * This state lives in the PLUGIN's own database, never on bb's thread. That
 * keeps a plugin concept out of bb's schema and out of the host-daemon
 * protocol, and uninstalling the plugin takes its state with it.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */

export interface ThreadLifecycleRow {
  threadId: string;
  /** When the user settled it; null when it is active. */
  settledAt: number | null;
}

/** The activity signals that outrank a user's parking decision. */
export interface ThreadActivitySignals {
  hasPendingInteraction: boolean;
  /** Any live work: runtime, workflows, background agents, plan, goals. */
  isWorking: boolean;
  /** Newest attention timestamp bb reports for the thread. */
  latestAttentionAt: number;
}

export type ThreadShelf = "active" | "settled";

/**
 * Whether a thread may be parked at all.
 *
 * bb has more kinds of live work than a single session status — workflows,
 * background agents, background commands, plan mode, goals — and every one of
 * them must block parking. Hiding a thread that is still working is the one
 * failure this feature cannot afford.
 */
export function canPark(signals: ThreadActivitySignals): boolean {
  return !signals.hasPendingInteraction && !signals.isWorking;
}

/**
 * Which shelf a thread belongs on right now.
 *
 * Live work and a raised hand always win, so a settled thread that starts
 * working or asks a question comes straight back. New attention since the
 * settle also resurfaces it: the thread has more to say than it did when the
 * user filed it away.
 */
export function resolveShelf(
  row: ThreadLifecycleRow | undefined,
  signals: ThreadActivitySignals,
): ThreadShelf {
  if (row === undefined) return "active";
  if (!canPark(signals)) return "active";
  if (row.settledAt !== null && signals.latestAttentionAt > row.settledAt) {
    return "active";
  }
  return row.settledAt !== null ? "settled" : "active";
}
