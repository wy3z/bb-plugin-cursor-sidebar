# Project Sidebar

This is a fresh sidebar add-on. The user explicitly abandoned the Command/Commander model on 2026-09-11. Earlier orchestration-product plans do not apply here.

## Current UI revision (user feedback, supersedes conflicting initial details)

- Unassigned Threads are grouped by recent activity: Pinned, Today, Yesterday, Last 7 days, Last 30 days, Older. Empty groups are omitted. Calendar boundaries follow the user's timezone; a parent and its children stay together using their latest active member's activity. Manual reorder remains within each age group.
- Requested next: drag unassigned threads into native BB projects. Not implemented: SDK 0.4.47's thread-update schema has no projectId field and sidebar actions have no move operation. User deferred this on 2026-09-11 pending discussion with the BB developer; do not extend BB core or fake project membership in plugin storage.
- Hide project/thread disclosure chevrons until hover or keyboard focus, with usable touch disclosure. Keep alignment stable and retain accessible expand/collapse state.
- Remove Snooze from the add-on. Existing snoozed records must become ordinary active threads rather than becoming inaccessible; preserve settled records. Remove obsolete controls, RPCs and copy safely.
- Remove provider icons from thread rows. Use a leading Git/PR state icon when a real PR is known, following Dray's open/draft/merged/closed semantics and its failing-check indication. No fabricated PR/branch status.
- Support persistent drag reordering of native projects and thread siblings, with keyboard alternatives and visible drop placement. Reordering never reassigns a project's threads or reparents a child. Preserve native split dragging out of the sidebar. Respect pin partitions without silently changing pin state.
- The muted Projects control opens a checkbox list of projects to show. Multiple or no named projects may be selected; hidden ids persist locally and new projects default visible. Visibility applies to active and settled work without changing native membership. Threads always remains available independently of the checklist.
- Improve hierarchy spacing and typography: clearly legible project labels and thread titles, more separation between project groups than between their threads, compact rows modeled on the screenshots. Use BB's fonts and palette, without giant cards or duplicate metadata.
- Child trees need faint vertical rails and elbow connectors, ending at the final child, aligned with leading icons/titles across depths.
- A fixed trailing slot shows age/activity normally; on hover/focus, pin/unpin and settle replace the time in the same space without shifting the title. Busy work remains ineligible for settling. Touch must expose the same actions accessibly. Restore takes the settle position for settled rows.
- The native personal/unprojected group is named Threads, using isPersonal metadata rather than matching a literal name. It remains BB's implicit personal container internally.
- Threads and Settled are fixed sections below native projects, with always-visible disclosure arrows and counts in both open/closed states, without horizontal rules. Threads counts active unassigned rows; Settled counts parked rows for visible projects plus unassigned threads. Both remain available when empty.
- Inbox's overlapping child dots/count sit directly left of age/activity in the trailing slot. Both hide on hover/focus to reveal pin/settle without changing the title's width. A separate hover/focus disclosure in the left gutter keeps child expansion usable. The Projects checklist has no unassigned-threads footer copy.
- Settled threads live in one collapsed, counted section under the thread list for all projects, not a shelf inside each project. Restore returns the exact thread to its active place. The section still respects the project filter. No new archive/worktree semantics.

References for this revision:

- /home/wyez/.bb/thread-storage/thr_6n9aeb5npc/Attachments/image-1789123042000-p53lvu.png
- /home/wyez/.bb/thread-storage/thr_6n9aeb5npc/Attachments/image-1789123149279-njq84d.png
- /home/wyez/.bb/thread-storage/thr_6n9aeb5npc/Attachments/image-1789123185626-4veg15.png
- Dray Sidebar.tsx SessionRow and PrStateIcon.tsx in the existing read-only reference checkout show leading PR marks, a shared trailing time/action slot, and tree connectors.

## Product

Use BB's actual projects as the only project containers. Inside each project, display ordinary native threads, with expandable native child threads. Combine the user's Inbox Sidebar lifecycle with the compact project-grouped layout in their Dray reference.

- Muted project headings in BB's native order, including empty projects. A scoped New thread action uses BB's composer.
- Compact rows: title, small factual activity/provider indicator, age, quiet selected background. Project identity appears once in the heading. Use BB theme tokens and font, not Dray branding or window chrome.
- Native pinned threads remain inside their project. Preserve hierarchy and avoid duplicate rows.
- Settle quiet threads into the global Settled section under the thread list; Restore brings them back. This never archives, deletes, stops agents, or cleans worktrees.
- Preserve nested children in active and settled trees, including deeper descendants. Busy descendants or pending interactions block settling their ancestors. New attention/live activity resurfaces affected work.
- Snooze may reuse Inbox's existing behavior, with its own collapsed section inside each project; no additional lifecycle concepts needed.
- Opening an existing child reveals its project, shelf and ancestors. Preserve normal BB navigation, split opening, keyboard thread navigation, and mobile drawer closing.
- Keep native project IDs, thread IDs and parent relationships authoritative. Missing-parent and unknown-project metadata must not lose threads. Handle malformed cycles defensively.

## Boundaries

Standalone package and plugin ID: bb-plugin-project-sidebar / project-sidebar. Reuse source from /home/wyez/Projects/Personal/bb-plugin-t3sidebar where useful, keeping its MIT attribution. Its checkout and live lifecycle data remain untouched. The new plugin owns its own lifecycle storage; no implicit migration.

No Commander objects, custom project database, orchestrator UI, notes/artifact panels, inbound subscriptions, or integration dependency on project-manager. No wholesale rollback or deletion of prior work. Do not register duplicate thread header actions while Inbox is installed. Register only the new sidebar and necessary plugin settings.

Do not add tests, packages, commits, remotes, PRs, installs/reloads, or mutate real user threads. The BB scaffold already installed its dependencies. Build and typecheck locally; coordinator handles source review and live verification. Remove the generated todo/demo surfaces and demo skill from this new scaffold.

## References

- Inbox source: /home/wyez/Projects/Personal/bb-plugin-t3sidebar
- User screenshot: /home/wyez/.bb/thread-storage/thr_6n9aeb5npc/Attachments/image-1789120835020-54i3zq.png
- Dray source (read-only reference): /home/wyez/.bb/thread-storage/thr_6n9aeb5npc/dray-reference
- Current SDK declarations: this add-on's node_modules/@get-bb/plugin-sdk (0.4.47).

## Review targets

Native grouping; empty projects; pinned and orphan rows; child/grandchild nesting; active-thread reveal; settle/restore with busy descendants; fresh attention and expired snooze; lifecycle loading/error honesty; keyboard/focus and touch access; per-project collapse persistence; build/typecheck; no dependency on Command or Inbox installation.
