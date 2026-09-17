import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";

import { useMediaQuery } from "./use-media-query.js";

/**
 * One definition of "phone mode": a narrow viewport OR a coarse pointer. It
 * matches the plugin's phone CSS block and the `max-md:`/`pointer-coarse:`
 * Tailwind pairs, so a wide touchscreen is treated the same everywhere.
 */
export const COMPACT_VIEWPORT_QUERY = "(max-width: 767px), (pointer: coarse)";

const CompactViewportOverrideContext = createContext<boolean | null>(null);

interface CompactViewportOverrideProviderProps {
  children: ReactNode;
  isCompactViewport: boolean;
}

export function CompactViewportOverrideProvider({
  children,
  isCompactViewport,
}: CompactViewportOverrideProviderProps) {
  return createElement(
    CompactViewportOverrideContext.Provider,
    { value: isCompactViewport },
    children,
  );
}

export function useIsCompactViewport(): boolean {
  const override = useContext(CompactViewportOverrideContext);
  const isCompactViewport = useMediaQuery(COMPACT_VIEWPORT_QUERY);
  if (override !== null) {
    return override;
  }
  return isCompactViewport;
}
