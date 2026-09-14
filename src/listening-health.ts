/**
 * Pure classification of the manager's native subscription state into a
 * Listening health summary.
 *
 * `enabled` alone is not health: a failed, missing, unavailable or completed
 * subscription is often disabled too, and reading every disabled row as
 * "paused" hides a real failure behind a benign label. The native `state` is
 * the authority; `enabled` only downgrades a healthy state that the user turned
 * off. Counts are per subscription, so a fleet with three completed and no
 * active reports "completed", never "0 active".
 */
export const LISTENING_HEALTH_KINDS = [
  "active",
  "paused",
  "creating",
  "completed",
  "failed",
  "unavailable",
  "unknown",
] as const;

export type ListeningHealthKind = (typeof LISTENING_HEALTH_KINDS)[number];

/** One native subscription row; only the facts this projection classifies. */
export interface SubscriptionHealthRecord {
  state: string;
  enabled: boolean;
}

export interface ListeningHealth {
  active: number;
  paused: number;
  creating: number;
  completed: number;
  failed: number;
  unavailable: number;
  unknown: number;
  /** Count of subscriptions that contributed. */
  total: number;
  /**
   * The most attention-worthy state present, by severity. `completed` outranks
   * nothing and reads only when no active subscription exists.
   */
  worst: ListeningHealthKind;
}

/**
 * Severity order for the one-line Core heading label. Higher wins. A real
 * failure outranks an unreadable row, which outranks setup, then a user pause,
 * then normal activity, then history.
 */
const SEVERITY: Record<ListeningHealthKind, number> = {
  failed: 6,
  unavailable: 5,
  creating: 4,
  paused: 3,
  active: 2,
  completed: 1,
  unknown: 0,
};

export function classifySubscription(record: SubscriptionHealthRecord): ListeningHealthKind {
  switch (record.state) {
    case "active":
    case "created":
      return record.enabled ? "active" : "paused";
    case "paused":
      return "paused";
    case "creating":
    case "ambiguous":
      return "creating";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "missing":
    case "unavailable":
      return "unavailable";
    default:
      return "unknown";
  }
}

export function summarizeListeningHealth(
  records: readonly SubscriptionHealthRecord[],
): ListeningHealth {
  const health: ListeningHealth = {
    active: 0,
    paused: 0,
    creating: 0,
    completed: 0,
    failed: 0,
    unavailable: 0,
    unknown: 0,
    total: records.length,
    worst: "unknown",
  };
  for (const record of records) {
    const kind = classifySubscription(record);
    health[kind] += 1;
    if (SEVERITY[kind] > SEVERITY[health.worst]) health.worst = kind;
  }
  return health;
}

const NAMED_WORST: ReadonlySet<ListeningHealthKind> = new Set([
  "failed",
  "unavailable",
  "creating",
  "paused",
  "completed",
  "unknown",
]);

/**
 * The Core heading's one-line Listening label, or null when the manager read
 * failed (the caller shows its own unavailable marker). A healthy subscribed
 * fleet reads as a count; anything stronger names itself and its count.
 */
export function listeningHealthLabel(
  health: ListeningHealth | null,
): string {
  if (health === null) return "Listening unavailable";
  if (health.total === 0) return "Listening 0 active";
  const kind = health.worst;
  if (NAMED_WORST.has(kind)) {
    const count = health[kind];
    return `Listening ${kind} (${count})`;
  }
  return `Listening ${health.active} active`;
}
