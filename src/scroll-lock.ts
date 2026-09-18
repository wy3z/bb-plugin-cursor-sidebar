/**
 * Held while a touch gesture owns the row: a drag that has lifted, or a swipe
 * that has locked sideways.
 *
 * `preventDefault` on a non-passive `touchmove` is the first defence, but it
 * loses races. `touch-action` is read once when a touch begins, so it cannot be
 * changed mid-gesture, and a compositor that has already started a pan ignores
 * the cancel. Taking the overflow away from the scroller is the part that works
 * from inside the gesture: the browser is left with nothing to pan, so the
 * touch stays with the row.
 *
 * Ref-counted, because the row gesture takes the lock and then hands the same
 * touch to the drag, which takes it again until the drop.
 */
let held: { element: HTMLElement; previous: string; count: number } | null = null;

/** The nearest ancestor that could actually scroll this row today. */
function scrollerFor(from: HTMLElement | null): HTMLElement | null {
  let node = from?.parentElement ?? null;
  while (node !== null) {
    const style = getComputedStyle(node);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function holdListScroll(from: HTMLElement | null): boolean {
  // A scroller that has left the document cannot be released or panned, so a
  // lock left over from an unmounted list is dropped rather than counted.
  if (held !== null && !held.element.isConnected) held = null;
  if (held !== null) {
    held.count += 1;
    return true;
  }
  const element = scrollerFor(from);
  if (element === null) return false;
  held = { element, previous: element.style.overflowY, count: 1 };
  element.style.overflowY = "hidden";
  return true;
}

export function releaseListScroll(): void {
  if (held === null) return;
  held.count -= 1;
  if (held.count > 0) return;
  const { element, previous } = held;
  held = null;
  element.style.overflowY = previous;
}
