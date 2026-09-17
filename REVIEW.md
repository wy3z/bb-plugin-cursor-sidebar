> Historical implementation notes. The current approved behavior is documented in [README.md](README.md); coordinator trees, explicit membership moves and removal of completion shelves supersede earlier UI decisions below.

# Project Sidebar integration review

## Trailing child indicator refinement — 2026-09-11

Removed the checklist footer sentence and Threads/Settled horizontal rules. Inbox's child dots/count now sit immediately before age/activity; the combined resting content hides on hover/focus while actions occupy the same footprint. The left gutter retains the accessible expansion button. Typecheck/build passed and plugin reloaded. Browser inspection verified visible resting indicator, hidden indicator plus visible pin/settle on keyboard focus, and unchanged title width. No thread mutations or test files.

## Project visibility and fixed sections — 2026-09-11

Replaced the single project filter with a muted Projects popover containing native checkboxes. Hidden ids persist locally, including through loading; Threads remains independent. Native reorder merges visible order back into the full project sequence so hidden projects retain their position. Threads and Settled now have divider lines, always-visible arrows and counts, and stay available when empty. Threads is explicitly described as threads not in a project.

Typecheck/build passed and plugin reloaded. Browser verified checkbox hide/show, persistence across reload, corrected Settled count when hiding a project, independent Threads, keyboard folding and the divider layout. Temporary visibility/folding choices restored. No captured project-sidebar warnings/errors; no real thread mutations or test files. Dragging with hidden projects was source-reviewed, not exercised in this pass.

## Inbox drag animation — 2026-09-11

Copied Inbox's AutoAnimate runtime and 150ms ease-out list animation into a shared AnimatedList, applied to sibling lists and project sections. Dragged rows/projects fade to 50%, and the grabbing cursor is removed on release/cancel/unmount. The animation respects reduced-motion preferences on attachment. Vendored the existing installed runtime with its MIT license; no package install or test files.

Typecheck/build passed and plugin reloaded. Live mouse drag reordered the implementation child, keyboard reorder restored it, the original filter was restored, and cursor/style cleanup was confirmed. No project-sidebar warnings/errors in captured logs. Actual project drag and physical touch were not exercised in this revision.

## Unassigned age groups — 2026-09-11

Implemented calendar-based age groups for active personal Threads only, pinned roots first, empty groups omitted, families kept together using their most recent active member. Drag/keyboard reorder is constrained to the same age group. Named projects and the global settled drawer retain their existing organization.

Coordinator typecheck/build passed and plugin reloaded. Live browser Threads filter shows Today, Yesterday, Last 7 days and Last 30 days with quiet headings; other groups are empty in current data. Screenshot reviewed. No thread mutations or test files. The user deferred cross-project assignment pending discussion with the BB developer; no BB core changes were made. Current blocker: current SDK updateThreadRequestSchema lacks projectId and sidebar actions lack a move operation.

## Current UI revision — accepted 2026-09-11

This section supersedes the historical review below, including snooze. Coordinator typecheck/build passed and the updated plugin was reloaded.

### Live verification

- Desktop inspection confirmed quiet hover/focus chevrons, connected child rails, 14px titles, 12px project/status labels, separated project groups, and pin/settle replacing the time slot. Provider marks and snooze controls are absent.
- Dragged the implementation child below a sibling without navigating; reloaded and verified persistent order and project filter. Alt+ArrowUp restored its original position with a position announcement.
- Dragged a native project; the CLI confirmed actual native project order changed. Keyboard reorder restored the original order, checked again through the CLI. Threads was excluded from native movement.
- Pinned and unpinned the implementation child; final pin state is off.
- Ctrl+Alt+S settled exactly the implementation child. Parent and siblings stayed active. Settled count increased from one to two; focus moved to its toggle. The child was findable with a parent link and Restore. Restore reattached it under its parent. The pre-existing user-settled thread was untouched; the shelf was collapsed again.
- A real merged PR displayed the leading purple Git mark and accessible description. Other states were source-reviewed.
- At 390×844, drawer/filter/typography/truncation/tree rails fit cleanly. Threads filter showed unprojected threads under Threads. Filter returned to All projects and viewport override reset.
- Temporary reorder/pin/lifecycle changes were undone. No messages, new threads, archive/delete operations or external publication.

### Corrections accepted

Stored-order reactivity and hidden sibling reconciliation; focused-element keyboard scoping; native project exclusions and serialized mutations; filter persistence during loading; drag cancellation/cleanup; descendant status aggregation. Earlier exact-child lifecycle, authoritative project membership, cycle handling, reveal-pending and focus/error recovery remain in place. Worker reports 33 transient assertions over real forest/lifecycle/order modules; no test files added.

### Current limits

- Mouse/pen drag and Alt+ArrowUp/Down reorder; no touch drag. Project drag is available in All projects. Thread moves stay within sibling/shelf/pin groups without reparenting or project changes.
- Narrow pass was desktop viewport emulation, not a physical touch device. Horizontal split drag was source-reviewed, not exercised in this revision.
- Only merged PR observed live; per-rendered-row PR subscriptions, no list windowing.
- Old snooze database columns remain inert; old snoozed state is cleared while settled rows are preserved.

Accepted and running. Worker thr_guwtjtanc3 runtime stopped; thread remains visible. No commits or publication.

## Historical initial implementation review (superseded where above differs)

Reviewed against BRIEF.md and the user's replacement of the Coordinator concept with native BB projects and Inbox-style thread lifecycle.

## Live checks completed

Installed the local add-on with `bb plugin install . --yes` after coordinator typecheck/build passed. BB Appearance reports Automatic is using Project Sidebar. The previously disabled Inbox and project-coordinator plugins were left disabled.

- Native project headings match the current BB project roster; the empty bb-filetree-upstream project remains visible. No custom project objects are involved.
- Expanded BB Projects and opened its completed implementation child.
- Ctrl+Alt+S settled exactly thr_guwtjtanc3. Its parent and siblings remained active; the child appeared in that project's Settled section with a parent link. Focus moved to the collapsed Settled toggle.
- Keyboard Restore reattached that child under its parent and returned focus to its anchor.
- Opened Snooze from keyboard, selected 30 minutes, observed the per-project Snoozed section and destination-toggle focus, then used Wake thread now. The child returned to its parent. Both temporary lifecycle changes were undone.
- Manually collapsed and reopened the current project successfully.
- Project-scoped New thread opened BB's native blank composer with bb-plugin-project-coordinator selected. No thread was submitted.
- Inspected the desktop layout and 1100×850 layout. Inspected the 390×844 drawer; project folding works and scoped New thread closes the drawer. The composer retains the requested project.
- Temporary browser viewport override was reset.
- No Project Sidebar errors in captured browser logs. Existing push-notifications bundle warnings are unrelated. Plugin backend reports running with zero handler errors.

## Source findings and corrections

The worker corrected exact-child lifecycle targeting, per-native-project forests, cycle/orphan handling, per-action errors/loading/pending behavior, focus recovery, mobile navigation, and user-controlled folding. The worker reports 35 transient assertions over the real pure forest/lifecycle modules; no test files were added.

Final narrow follow-up accepted: active-thread reveal remains pending until the thread data exists; successful lifecycle refresh advances the clock so already-expired snoozes do not compare against a stale mount-time clock. Coordinator reviewed both changes, reran typecheck/build successfully and reloaded project-sidebar. A fresh browser load revealed the selected child, its project and its ancestor. Manual project folding still worked; reloading then revealed the current child again. No project-sidebar warnings/errors in the final browser check. The expired-at-fetch path was source-reviewed; no artificial delay was injected into the live server.

## Verification limits

The 390px pass used desktop Chrome viewport emulation, not a physical touch device. No native archive/delete action, real new thread, or worktree cleanup was executed. Only this task's completed implementation child was temporarily settled/snoozed, then restored.

An additional isolated SDK backend harness could not initialize because the scaffold's local better-sqlite3 native binding is absent. No package was installed or rebuilt to support that optional check. Actual settle/restore/snooze/wake RPCs were exercised through the running BB plugin instead.

No commits or external publication.

## Outcome

Accepted. The standalone Project Sidebar is installed, running, and selected by BB's Automatic sidebar setting. Implementation worker thr_guwtjtanc3 is complete; its thread remains visible for history.
