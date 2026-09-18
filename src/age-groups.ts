export const AGE_GROUPS = [
  "Today", "Yesterday", "Last 7 days", "Last 30 days", "Older",
] as const;
export type AgeGroup = typeof AGE_GROUPS[number];

export function ageGroupKey(sectionId: string, group: AgeGroup): string {
  return `age:${sectionId}:${group}`;
}

/** Calendar boundaries in the user's timezone, including daylight-saving days.
 *
 * Uses native `updatedAt` (last thread activity), never `lastReadAt` or
 * observation state, so incidental reads do not reclassify a thread.
 * Cutoffs are 1, 7 and 30 full calendar days before today, so any elapsed
 * label under 1d stays in Today/Yesterday, any under 7d stays inside
 * Last 7 days and any under 30d stays inside Last 30 days. This is the
 * published bucket API for the pinned/folder owner.
 */
export function bucketForTimestamp(timestamp: number, now: number): AgeGroup {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const boundary = (days: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date.getTime();
  };
  if (timestamp >= boundary(0)) return "Today";
  if (timestamp >= boundary(1)) return "Yesterday";
  if (timestamp >= boundary(7)) return "Last 7 days";
  if (timestamp >= boundary(30)) return "Last 30 days";
  return "Older";
}
