/**
 * Paseo's workspace reorder motion, applied to project sections.
 *
 * Paseo sorts its sidebar with dnd-kit's vertical sortable list, and this
 * reproduces what that looks like rather than pulling dnd-kit in alongside our
 * own drag engine: the picked-up section itself follows the pointer on the y
 * axis only, lifted with `scale(1.02)`, `opacity: 0.9` and a raised z-index;
 * every section between its old and new slot slides out of the way by the
 * dragged section's height with `transform 200ms ease`; and a release glides
 * the section into its slot over the same 200ms before the new order lands.
 * Nothing reflows during the drag, only transforms move.
 *
 * One departure: dnd-kit targets the item whose center is closest to the
 * dragged one's, which suits Paseo's rows of one height. An open project can
 * be many rows tall, and its center sits far below the heading under the
 * pointer, so a center test swaps late. Here the leading edge decides: moving
 * down, the dragged bottom passing a section's center takes its slot; moving
 * up, the dragged top does.
 */

const MOVE_MS = 200;
const MOVE_EASING = "ease";
const LIFT_SCALE = "scale(1.02)";
const LIFT_OPACITY = "0.9";
const LIFT_Z_INDEX = "1000";

/** The inline properties this file writes, so a dispose leaves nothing behind. */
const TOUCHED = ["transform", "transition", "opacity", "z-index", "position", "background", "border-radius", "will-change"] as const;

export interface ProjectSortTarget {
  /** The section the drop would land beside, or null for its own slot. */
  overId: string | null;
  placement: "before" | "after" | null;
}

export interface ProjectSort {
  /** Follow the pointer: `dy` is how far it has moved since the pick-up. */
  move: (dy: number) => ProjectSortTarget;
  /** Glide the dragged section into its slot, then call `done`. */
  settle: (done: () => void) => void;
  /** Send every section back to where it started, then call `done`. */
  revert: (done: () => void) => void;
  /**
   * Skip any running glide and clear every style. `land` runs its `done` now;
   * an unmount passes false, as there is nothing left to land in.
   */
  finish: (land?: boolean) => void;
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function headingOf(section: HTMLElement): HTMLElement | null {
  return section.querySelector<HTMLElement>('[data-reorder-kind="project"]');
}

/**
 * Lift the section that owns `heading` and return the controls that move it.
 * Null when the heading is not inside a sortable section list.
 */
export function liftProjectSection(heading: HTMLElement | null): ProjectSort | null {
  const active = heading?.closest<HTMLElement>("section") ?? null;
  const list = active?.parentElement ?? null;
  if (active === null || list === null) return null;
  // The drawers around the list clip to animate their height. A lifted
  // section can reach past the list's edges, so they show their overflow for
  // the drag; the scroller itself still clips, as a scroller should.
  const unclipped: { element: HTMLElement; overflow: string }[] = [];
  const stop = scrollParentOf(list) ?? list.closest<HTMLElement>("[data-cursor-sidebar-root]");
  for (let node: HTMLElement | null = list; node !== null && node !== stop; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (overflowX === "hidden" || overflowY === "hidden" || overflowX === "clip" || overflowY === "clip") {
      unclipped.push({ element: node, overflow: node.style.overflow });
      node.style.overflow = "visible";
    }
  }
  const items = Array.from(list.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && headingOf(child) !== null,
  );
  const activeIndex = items.indexOf(active);
  if (activeIndex < 0) return null;
  // Resting rects, measured once: the targets and shifts are worked out
  // against where the sections sit before anything moves, as dnd-kit does.
  const rects = items.map((item) => item.getBoundingClientRect());
  const activeRect = rects[activeIndex]!;
  const centers = rects.map((rect) => rect.top + rect.height / 2);
  const duration = reducedMotion() ? 0 : MOVE_MS;
  const transition = `transform ${duration}ms ${MOVE_EASING}`;
  let overIndex = activeIndex;
  let pending: { timer: ReturnType<typeof setTimeout>; done: () => void } | null = null;

  for (const item of items) {
    if (item !== active) item.style.transition = transition;
  }
  const lift = active.style;
  lift.position = "relative";
  lift.zIndex = LIFT_Z_INDEX;
  lift.opacity = LIFT_OPACITY;
  lift.willChange = "transform";
  // The section is transparent, and it passes over its neighbours while they
  // slide, so it carries the list's own surface.
  lift.background = "var(--sidebar, #1c1c1f)";
  lift.borderRadius = "6px";
  lift.transition = "none";
  lift.transform = LIFT_SCALE;

  /** The gap dnd-kit keeps between a shifted item and its neighbour. */
  const gapAt = (index: number) =>
    index > activeIndex
      ? rects[index]!.top - rects[index - 1]!.bottom
      : rects[index + 1]!.top - rects[index]!.bottom;

  const shiftSiblings = () => {
    items.forEach((item, index) => {
      if (index === activeIndex) return;
      let y = 0;
      if (index > activeIndex && index <= overIndex) y = -(activeRect.height + gapAt(index));
      else if (index < activeIndex && index >= overIndex) y = activeRect.height + gapAt(index);
      item.style.transform = y === 0 ? "" : `translate3d(0, ${y}px, 0)`;
    });
  };

  const target = (): ProjectSortTarget => {
    if (overIndex === activeIndex) return { overId: null, placement: null };
    return {
      overId: headingOf(items[overIndex]!)?.dataset.reorderId ?? null,
      placement: overIndex > activeIndex ? "after" : "before",
    };
  };

  const clear = () => {
    for (const item of items) {
      for (const name of TOUCHED) item.style.removeProperty(name);
    }
    for (const { element, overflow } of unclipped) element.style.overflow = overflow;
    unclipped.length = 0;
  };

  const glide = (y: number, done: () => void) => {
    lift.transition = transition;
    lift.opacity = "";
    lift.transform = y === 0 ? "" : `translate3d(0, ${y}px, 0)`;
    const timer = setTimeout(() => {
      pending = null;
      done();
      clear();
    }, duration);
    pending = { timer, done };
  };

  return {
    move(dy) {
      const top = activeRect.top + dy;
      const bottom = activeRect.bottom + dy;
      let closest = activeIndex;
      for (let index = activeIndex + 1; index < centers.length && bottom > centers[index]!; index += 1) {
        closest = index;
      }
      if (closest === activeIndex) {
        for (let index = activeIndex - 1; index >= 0 && top < centers[index]!; index -= 1) {
          closest = index;
        }
      }
      lift.transform = `translate3d(0, ${Math.round(dy)}px, 0) ${LIFT_SCALE}`;
      if (closest !== overIndex) {
        overIndex = closest;
        shiftSiblings();
      }
      return target();
    },
    settle(done) {
      const slot =
        overIndex > activeIndex
          ? rects[overIndex]!.bottom - activeRect.bottom
          : overIndex < activeIndex
            ? rects[overIndex]!.top - activeRect.top
            : 0;
      glide(slot, done);
    },
    revert(done) {
      overIndex = activeIndex;
      shiftSiblings();
      glide(0, done);
    },
    finish(land = true) {
      if (pending !== null) {
        clearTimeout(pending.timer);
        const { done } = pending;
        pending = null;
        if (land) done();
      }
      clear();
    },
  };
}

/** The nearest ancestor that scrolls vertically, so a wheel mid-drag is counted. */
export function scrollParentOf(from: HTMLElement | null): HTMLElement | null {
  let node = from?.parentElement ?? null;
  while (node !== null) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}
