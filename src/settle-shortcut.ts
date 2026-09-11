export const SETTLE_SHORTCUT = "Control+Alt+S";
export const SETTLE_SHORTCUT_LABEL = "Ctrl+Alt+S";

const PROTECTED_TARGET = [
  "input", "textarea", "select", '[role="combobox"]', '[role="spinbutton"]',
  ".monaco-editor", ".cm-editor", ".xterm", '[role="dialog"]', '[role="menu"]',
].join(",");

/**
 * Whether a key event is the settle chord and is safe to act on. Refuses
 * while the user is typing, while a modal/menu is up, and while the composer
 * owns the keystroke.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong).
 */
export function matchesSettleShortcut(event: KeyboardEvent): boolean {
  if (
    event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 ||
    !event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey ||
    event.getModifierState("AltGraph") || event.key.toLowerCase() !== "s"
  ) return false;
  if (document.querySelector('[aria-modal="true"], dialog[open]')) return false;
  const targets = [...event.composedPath(), document.activeElement];
  return !targets.some((target) => {
    if (!(target instanceof Element)) return false;
    if (target.closest(PROTECTED_TARGET)) return true;
    return isProtectedEditor(target);
  });
}

function isProtectedEditor(element: Element): boolean {
  const editable = element.closest(
    '[contenteditable]:not([contenteditable="false"]), [role="textbox"]',
  );
  return (
    editable !== null &&
    !editable.matches(
      '[data-promptbox-editor-content] .ProseMirror[contenteditable="true"]',
    )
  );
}

/**
 * Whether a keyboard event target is a text field, editor, dialog or menu that
 * a plugin reorder shortcut must never act on. Unlike the settle chord, this
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
