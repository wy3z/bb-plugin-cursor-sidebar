import { shortAge } from "@wy3z/bb-suite/time";

export function relativeTimeLabel(timestamp: number, now: number): string {
  return shortAge(timestamp, now);
}
