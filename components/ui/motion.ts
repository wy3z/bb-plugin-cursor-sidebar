export const CONTROL_HOVER_TRANSITION =
  "transition-colors duration-150 hover:duration-0";

/**
 * Entrance/exit for Radix anchored surfaces (popovers, dropdowns, menus).
 * Anchored surfaces emerge from the trigger, so the pair animates opacity and
 * a small scale rather than travelling; reduced motion skips both.
 */
export const ANCHORED_OVERLAY_MOTION =
  "duration-150 ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none";
