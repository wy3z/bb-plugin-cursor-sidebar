> Historical implementation notes. The current approved behavior is documented in [README.md](README.md); coordinator trees, explicit membership moves and removal of completion shelves supersede earlier UI decisions below.

# Implementation notes

Fresh standalone **Project Sidebar** add-on in
`/home/wyez/Projects/Personal/bb-plugin-project-sidebar`. The earlier
Coordinator/orchestration plans are discarded; the authoritative scope is the
"Current UI revision" in `BRIEF.md`. Nothing outside this directory was
modified.

## This revision (user UI pass)

All of the following landed in one coherent pass; no other surface changed.

- **Hover/focus-only chevrons.** Project and child disclosure chevrons are
  opacity-hidden until hover or keyboard focus, keep a fixed reserved box so
  titles do not shift, stay `aria-expanded`, and are always visible at
  coarse-pointer sizes.
- **Snooze removed end to end.** Removed the Snooze menu/controls, the
  `snooze`/`unsnooze`/`acknowledgeWake` RPCs, all wake/timer copy, and the
  `now`/timer machinery from the lifecycle client. `src/server.ts` keeps the
  old `snoozed_*` columns inert but clears them on load, so existing snoozed
  records become ordinary active threads; settled rows are untouched.
- **Provider icons removed.** Deleted `ProviderGlyph.tsx` and
  `provider-marks.ts` and the `experimental_useProviders` read.
- **Leading Git/PR mark.** `src/PullRequestMark.tsx` uses
  `experimental_useSidebarThreadPullRequest(threadId)` (host cache, per row, no
  bulk Git subprocess) and renders only for a real PR: open (success), draft
  (muted), merged (`text-pr-merged`), closed (`text-destructive`), with
  `attention === "checks_failed"` recolouring to destructive. No fabricated
  branch/provider state.
- **Drag reorder.** Projects reorder through
  `bb.sdk.projects.reorder({ projectId, previousProjectId, nextProjectId })`
  via a server RPC; threads reorder through a plugin-owned, per-sibling-scope
  order overlay (`thread_order` + revision table, compare-and-set). The drag
  engages only on a deliberate vertical move (horizontal stays the host split
  gesture), reorders live, suppresses the click that follows, and cancels on
  Escape. `Alt+ArrowUp/Down` moves the focused row or project. Drops never
  reparent a thread, change its project, or change pin state; pinned threads
  form a partition and drag only inside it.
- **Project filter.** A compact vendored `Select` at the top offers All
  projects, each native project, and Threads. It filters active and settled
  work together; the choice is persisted and reconciles to All once data is
  ready. Settled sections stay reachable under every filter.
- **Hierarchy and typography.** Larger separation between project groups than
  between rows, semibold muted project labels, `text-sm` titles, `min-h-7`
  compact rows, and a single leading PR slot instead of duplicate metadata.
- **Tree rails.** `flattenShelf` emits per-row `depth`, `guides` and `opens`,
  and the row draws faint pass-through rails, a parent elbow, and a
  centre-down rail that closes at the last child.
- **Shared trailing slot.** One fixed-width slot shows status/age; on
  hover/focus (and always on coarse pointers) pin + settle — or pin + restore
  for settled rows — replace the time in the same space, so the title never
  shifts. Busy/pending threads are ineligible for settle.
- **Threads label.** The personal container is labelled Threads from
  `isPersonal` metadata; it remains BB's personal project internally.
- **Settled discoverability.** A collapsed, counted Settled section stays
  inside the owning project (or Threads) with Restore.

## Fixes after source review (this pass)

The coordinator's source review found correctness issues; all were fixed:

1. **Stored-order reactivity.** `effectiveOrderForScope` now depends on the
   reactive `threadOrders.orderForScope` (which changes whenever the order map
   changes) instead of only `drag.state` plus a ref, so `sections` recomputes
   for initial load, optimistic success, rollback, and realtime updates.
   Drag/keyboard commits reconcile the stored order against the complete
   current `scopeIds` first (`reconcileOrder`) and then merge the visible
   reorder (`mergeVisibleOrder`), so new siblings and hidden settled siblings
   keep a slot instead of being discarded.
2. **Keyboard scoping.** The handler moved from a document capture listener to
   the sidebar list's bubbling `onKeyDown`. It ignores repeats, IME, handled
   events, and any input/contenteditable/dialog/menu target, checks the focused
   project heading before the focused thread, never falls back to the route's
   `activeThreadId`, reads the focused row's real shelf and pin partition, and
   announces the moved item and position through an `aria-live` region.
3. **Project reordering.** `isPersonal` (and unknown) groups are excluded from
   the drag ids, native neighbor ids, and keyboard moves; `Threads` keeps its
   position via `mergeVisibleOrder`. Overlapping project reorders are
   serialized on a promise chain, and an older failed request cannot clear a
   newer optimistic order (`projectAttemptRef`). The overlay reconciles once
   the native reorderable order matches, and is dropped on error.
4. **Filter persistence.** The reconcile effect is gated on thread `status ===
   "ready"`, so a loading frame with an empty project list can no longer wipe a
   valid saved filter. The saved project/Threads choice and its settled access
   survive a reload.
5. **Drag lifecycle.** The previous `document.body.style.userSelect` is saved
   and restored; the click-suppression timer is cleared on unmount; an engaged
   drag suppresses the following click even on Escape or when it returns to its
   start; a committed horizontal move cancels the pending reorder so the host
   split gesture owns it; and a two-pixel placement line marks the live drop
   target in addition to the live reorder.
6. **Aggregated descendant status.** The resting trailing slot uses
   `statusSourceForGroup(thread, descendants)`, so a collapsed or collapsed-
   chevron parent still shows a running or attention-seeking descendant.

**Typography.** Titles are `text-sm` (14px), project labels `text-xs`
semibold (12px), and the resting age/status `text-xs` (12px) — up from the
previous `text-2xs` — using host tokens for scaling. Secondary chrome (error
bars, empty-project note) stays `text-2xs`.

## Preserved behaviors

Exact-thread `Ctrl+Alt+S`, the global busy-descendant parking guard,
cross-project child placement, cycle/orphan safety, readiness/error/mutation
gating with retry, focus after settling/restoring, reveal pending until data
loads and user folding afterward, native split dragging, click suppression
after drag, and mobile drawer navigation all survive.

## Changed files

- Updated: `app.tsx`, `package.json` (unchanged deps, description),
  `src/server.ts`, `src/lifecycle.ts`, `src/useLifecycle.ts`,
  `src/forest.ts`, `src/collapse.ts`, `src/ThreadTree.tsx`,
  `src/ProjectSidebar.tsx`, `src/StatusSlot.tsx`, `README.md`,
  `PLUGIN_OVERVIEW.md`, `THIRD-PARTY-NOTICES.md`.
- Added: `src/thread-order.ts`, `src/useThreadOrders.ts`,
  `src/useReorderDrag.ts`, `src/PullRequestMark.tsx`,
  `components/ui/select.tsx`.
- Removed: `src/SnoozeMenu.tsx`, `src/ProviderGlyph.tsx`,
  `src/provider-marks.ts`.

## Checks run

- `./node_modules/.bin/tsc --noEmit` → clean (exit 0).
- `bb plugin build` → writes `dist/app.js`, `dist/app.css`, `dist/server.js`,
  and metas with `pluginId: "project-sidebar"`, `sdkVersion 0.4.47`,
  `bbVersion 0.42.1`.
- Bounded transient in-memory assertions (a throwaway script under
  `/tmp/opencode`, **not** a file in this repo; it copies `src/` to `/tmp` and
  rewrites relative imports so Node 24 can strip types) imported the real
  `forest.ts`, `lifecycle.ts`, and `thread-order.ts` and covered 33 cases
  across two scripts: cycle totality, cross-project child placement and native
  ids, child settle placement, flatten depth/guides/opens and collapse,
  busy-descendant blocking and resurfacing, unknown-project separation, stored
  order + pinned-first, hidden-slot merge, move helpers, the Threads display
  mapping, `reconcileOrder` (append/drop/null), hidden-settled-slot
  preservation through a drag merge, pin-partition keyboard moves, the
  `personal` section flag, and order-function reactivity. All passed.
- No tests, dependencies, installs, reloads, commits, or real thread-lifecycle
  mutations were performed.

## Limits / known gaps

- Live browser verification is owned by the coordinator; this pass was
  typecheck/build/assertion-verified only.
- `experimental_useSidebarThreadPullRequest` is called once per rendered row
  (the host caches and polls), but no explicit windowing is added, so a very
  large expanded list mounts many row subscriptions. Acceptable at sidebar
  scale; windowing would be the next step.
- Project drag is enabled only in the All-projects view; while filtered the
  heading has no reorder target, so neither drag nor keyboard project move
  runs. Native project reorder excludes the implicit Threads container.
- The optimistic project overlay reconciles when the host's project list order
  matches it; if a host build never reflected `projects.reorder` in
  `experimental_useSidebarThreads().projects`, the client override would
  persist for that session.
- Touch drag is not implemented (pointer drag is mouse/pen only); touch keeps
  pin/settle/restore and the keyboard move path.
- The persistent order is per sibling scope and client-agnostic; it is an
  overlay, so native thread ordering is never rewritten. Reordering is scoped
  to the focused row's shelf and pin partition.
- `isCompactViewport` is still not branched on; compact/touch behavior is
  driven by `onNavigate`, Radix overlays, and `pointer-coarse`/`hover` media
  queries.
- Old `snoozed_*` columns remain in the table (inert) so an existing store
  migrates without a rewrite.
- No source test harness exists in the scaffold; the drag/filter interactions
  are verified by construction and types plus the pure assertions above.


## Cursor comparison and restrained polish (2026-09-11)

Compared the supplied sidebar screenshot with Cursor’s published Projects demo at https://cursor.com/changelog/projects. The useful visual lessons were consistent row alignment, a clear difference between titles and metadata, and compact spacing. BB native project membership and existing sidebar behavior remain the model.

This pass sets desktop rows to 28px while retaining coarse-pointer sizing, project labels to the host 12px token at medium weight with improved contrast, and timestamps to quieter secondary text. Project spacing is 16px, with 8px after a collapsed project. Project headings now inherit hover colour correctly and show keyboard focus rings. Threads/Settled keep their small labels and ellipses without counts, rules, or chevrons; their targets are 24px tall. Settled titles are more legible. Full thread/project names are available through native title tooltips. Pin/settle controls have distinct hover and keyboard focus feedback. Removed the obsolete section count prop.

Verification: typecheck and plugin build pass; plugin reloaded. Live Chrome check at a 319px sidebar width measured 28px rows and 12px/500 project labels. Keyboard focus kept the row width at 299px and revealed actions with a focus ring. Expanded child rails and settled project headings were inspected; both active and settled lists had zero horizontally overflowing rows. Plugin-filtered browser warning/error log was empty. Temporary fold changes were restored. Full mobile viewport/touch and drag reorder were not re-tested in this styling pass.
