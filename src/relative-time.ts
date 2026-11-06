const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTimeLabel(timestamp: number, now: number): string {
  const ms = Math.max(0, now - timestamp);
  if (ms < MINUTE) return "now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)}d`;
  if (ms < 30 * DAY) return `${Math.floor(ms / (7 * DAY))}w`;
  if (ms < 365 * DAY) return `${Math.floor(ms / (30 * DAY))}mo`;
  return `${Math.floor(ms / (365 * DAY))}y`;
}
