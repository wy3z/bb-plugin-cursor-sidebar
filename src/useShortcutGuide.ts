import { useEffect, useMemo, useState } from "react";

/**
 * The guide numbers in document order, at most nine, the same rule the host
 * uses to build its `thread.jump.*` map from `[data-sidebar-thread-shortcut-target]`
 * links. Our rows carry those links, so the numbering matches whatever else the
 * host has rendered above them.
 */
const GUIDE_HOLD_MS = 740;
const SHORTCUT_SELECTOR = "[data-sidebar-thread-shortcut-target]";
const DIGITS = "123456789";
/** The host labels its chips the same way: a word on Windows/Linux, ⌘ on mac. */
const MODIFIER =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

function shortcutTargets(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>(SHORTCUT_SELECTOR)).slice(
    0,
    DIGITS.length,
  );
}

/**
 * BB's keybind guide appears once the modifier has been held for about 700ms
 * (measured: its chips land at 708–714ms). Ours waits a touch longer so the
 * host's guide leads and the row numbers join it rather than pre-empting it.
 * Mirroring the host's numbering then lets the plugin show the same digits, and
 * a digit opens that row, since the host's own jump shortcuts do not reach
 * plugin-rendered rows.
 */
export function useShortcutGuide(): ReadonlyMap<string, string> | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      setVisible(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Control" && event.key !== "Meta") return;
      if (event.repeat || holdTimer !== null) return;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        setVisible(true);
      }, GUIDE_HOLD_MS);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Control" && event.key !== "Meta") return;
      stop();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
      if (holdTimer !== null) clearTimeout(holdTimer);
    };
  }, []);

  // One snapshot per guide appearance: the digits shown and the digits pressed
  // must be the same list, or a row that moved while the modifier was held
  // would answer to a number it never displayed.
  const targets = useMemo(() => (visible ? shortcutTargets() : []), [visible]);
  const keys = useMemo(() => {
    if (!visible) return null;
    const map = new Map<string, string>();
    targets.forEach((element, index) => {
      const id = element.dataset.sidebarThreadId;
      if (id !== undefined) map.set(id, `${MODIFIER} + ${DIGITS[index]!}`);
    });
    return map;
  }, [targets, visible]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const index = DIGITS.indexOf(event.key);
      if (index < 0) return;
      const target = targets[index];
      if (target === undefined) return;
      // Own the chord so a host handler cannot also act on it.
      event.preventDefault();
      event.stopPropagation();
      target.click();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [targets, visible]);

  return keys;
}
