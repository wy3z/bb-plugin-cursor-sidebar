import { flattenShelf, type DisplayRow, type ProjectSectionData } from "./forest";

export const AGE_GROUPS = [
  "Pinned", "Today", "Last 7 days", "Last 30 days", "Older",
] as const;
export type AgeGroup = typeof AGE_GROUPS[number];

export function ageGroupKey(sectionId: string, group: AgeGroup): string {
  return `age:${sectionId}:${group}`;
}

/** Calendar boundaries in the user's timezone, including daylight-saving days. */
function ageGroup(timestamp: number, now: number): AgeGroup {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const boundary = (days: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date.getTime();
  };
  if (timestamp >= boundary(0)) return "Today";
  if (timestamp >= boundary(6)) return "Last 7 days";
  if (timestamp >= boundary(29)) return "Last 30 days";
  return "Older";
}

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
    const group = root.thread.isPinned ? "Pinned" : ageGroup(latest, now);
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
): Array<{ label: AgeGroup; rows: DisplayRow[] }> {
  return AGE_GROUPS.map((label) => ({
    label,
    rows: rows.filter((row) => groups.get(row.thread.id) === label),
  })).filter((group) => group.rows.length > 0);
}
