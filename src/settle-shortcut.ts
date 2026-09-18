const PROTECTED_TARGET = [
  "input", "textarea", "select", '[role="combobox"]', '[role="spinbutton"]',
  ".monaco-editor", ".cm-editor", ".xterm", '[role="dialog"]', '[role="menu"]',
].join(",");

/**
 * Whether a keyboard event target is a text field, editor, dialog or menu that
 * a plugin reorder shortcut must never act on. Unlike a settle chord, this
 * protects BB's composer too: an arrow key while typing is never a reorder.
 */
export function isProtectedInteractionTarget(
  element: Element | null,
): boolean {
  if (element === null) return false;
  if (element.closest(PROTECTED_TARGET)) return true;
  return (
    element.closest(
      '[contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ) !== null
  );
}
