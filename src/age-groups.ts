import { flattenShelf, type DisplayRow, type ProjectSectionData } from "./forest";

export const AGE_GROUPS = [
  "Today", "Last 7 days", "Last 30 days", "Older",
] as const;
export type AgeGroup = typeof AGE_GROUPS[number];

export function ageGroupKey(sectionId: string, group: AgeGroup): string {
  return `age:${sectionId}:${group}`;
}

/** Calendar boundaries in the user's timezone, including daylight-saving days.
 *
 * Uses native `updatedAt` (last thread activity), never `lastReadAt` or
 * observation state, so incidental reads do not reclassify a thread.
 * Cutoffs are 7 and 30 full calendar days before today, so any elapsed
 * label under 7d stays in Today/Last 7 days and any under 30d stays inside
 * Last 30 days. This is the published bucket API for the pinned/folder owner.
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
  if (timestamp >= boundary(7)) return "Last 7 days";
  if (timestamp >= boundary(30)) return "Last 30 days";
  return "Older";
}

/** Compatibility alias for the published bucket API. */
export const ageGroup = bucketForTimestamp;

/** A subtree stays together and uses its newest active member's activity. */
export function personalAgeGroups(
  section: ProjectSectionData,
  now: number,
): ReadonlyMap<string, AgeGroup> {
  const fullRows = flattenShelf(section, "active");
  const groups = new Map<string, AgeGroup>();
  let family: DisplayRow[] = [];
  const flush = () => {
    const root = family[0];
    if (!root) return;
    const latest = family.reduce(
      (value, row) => Math.max(value, row.thread.updatedAt),
      root.thread.updatedAt,
    );
    const group = bucketForTimestamp(latest, now);
    for (const row of family) groups.set(row.thread.id, group);
  };
  for (const row of fullRows) {
    if (row.depth === 0) {
      flush();
      family = [];
    }
    family.push(row);
  }
  flush();
  return groups;
}

export function groupPersonalRows(
  rows: readonly DisplayRow[],
  groups: ReadonlyMap<string, AgeGroup>,
  now?: number,
): Array<{ label: AgeGroup; rows: DisplayRow[] }> {
  return AGE_GROUPS.map((label) => ({
    label,
    rows: rows.filter((row) => {
      const grouped = groups.get(row.thread.id);
      if (grouped !== undefined) return grouped === label;
      if (now !== undefined) return bucketForTimestamp(row.thread.updatedAt, now) === label;
      return label === "Older";
    }),
  })).filter((group) => group.rows.length > 0);
}
