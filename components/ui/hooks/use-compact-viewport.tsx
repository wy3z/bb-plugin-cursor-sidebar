import { useMediaQuery } from "./use-media-query.js";

/**
 * One definition of "phone mode": a narrow viewport OR a coarse pointer. It
 * matches the plugin's phone CSS block and the `max-md:`/`pointer-coarse:`
 * Tailwind pairs, so a wide touchscreen is treated the same everywhere.
 */
export const COMPACT_VIEWPORT_QUERY = "(max-width: 767px), (pointer: coarse)";

export function useIsCompactViewport(): boolean {
  return useMediaQuery(COMPACT_VIEWPORT_QUERY);
}
