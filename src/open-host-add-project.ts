/**
 * Open bb's own Add project dialog. Plugins have no SDK for it; the sidebar
 * sits under the host provider that owns `openCreateDialog`, so we walk the
 * React tree from a mounted node until we find that function.
 */
type HostCreate = {
  isAvailable?: boolean;
  openCreateDialog: () => void;
};

type Fiber = {
  memoizedProps?: { value?: unknown };
  pendingProps?: { value?: unknown };
  return?: Fiber | null;
};

function isHostCreate(value: unknown): value is HostCreate {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { isAvailable?: unknown; openCreateDialog?: unknown };
  return typeof record.openCreateDialog === "function";
}

function fiberOf(node: EventTarget | null): Fiber | null {
  if (!(node instanceof Element)) return null;
  for (const key of Object.keys(node)) {
    if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
      return (node as unknown as Record<string, Fiber | undefined>)[key] ?? null;
    }
  }
  return null;
}

export function openHostAddProject(from: EventTarget | null): boolean {
  let fiber = fiberOf(from);
  for (let hops = 0; fiber && hops < 120; hops++) {
    const value = fiber.memoizedProps?.value ?? fiber.pendingProps?.value;
    if (isHostCreate(value)) {
      if (value.isAvailable === false) return false;
      value.openCreateDialog();
      return true;
    }
    fiber = fiber.return ?? null;
  }
  return false;
}
