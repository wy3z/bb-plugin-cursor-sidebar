/**
 * The Project name the manager derives from a directory path, matching the
 * resolver's own convention (the last path segment). Pure so the composer's
 * read-only name preview is testable without the dialog.
 */
export function derivedProjectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}
