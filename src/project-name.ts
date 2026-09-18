/**
 * Derive a native Project name from a directory path (last path segment).
 * Pure so the create-project dialog preview matches the backend.
 */
const MAX_DERIVED_NAME = 200;

/** Normalize a path for exact dedup without touching the filesystem. */
export function normalizeDirectoryPath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

export function derivedProjectName(path: string): string {
  const normalized = normalizeDirectoryPath(path);
  const base = normalized.split(/[\\/]/).filter((segment) => segment.length > 0).pop();
  const candidate = (base ?? "Workspace").trim();
  return (candidate.length > 0 ? candidate : "Workspace").slice(0, MAX_DERIVED_NAME);
}
