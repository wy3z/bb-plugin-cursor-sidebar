# bb-plugin-project-sidebar

A BB plugin that replaces the sidebar's thread list with a project-grouped
view: BB's own projects as the only containers (the personal container shown
as **Threads**), ordinary threads with their nested children, a leading
Git/PR mark when a real pull request is known, and a collapsed settled shelf
under the thread list.

Unassigned **Threads** are grouped into Today, Yesterday, Last 7 days,
Last 30 days and Older, with pinned roots first. Families stay together and
use their latest active member's activity; reorder stays within an age group.
Drag-to-project assignment is deferred pending discussion with the BB developer and native API support.

The muted **Projects** control opens a persistent visibility checklist.
**Threads** stays available for unassigned chats; **Threads** and **Settled**
use visible disclosure arrows and counts to distinguish them
from named projects. Project visibility also applies within Settled.

This is a fresh, focused add-on. It is not the earlier Commander/orchestration
effort, and it deliberately depends on nothing but the BB Plugin SDK.

## Layout

- `app.tsx` — frontend entry. Registers exactly one slot,
  `experimental_threadList`, and no thread header actions.
- `src/server.ts` — backend: the settled store and the thread-order overlay in
  `bb.storage.database()`, the RPC contract, project reordering through
  `bb.sdk.projects.reorder`, and the realtime signals the frontend reads.
- `src/ProjectSidebar.tsx` — the list: the project filter, project sections,
  empty projects, the per-project Settled section, one-shot active-thread
  reveal, connected focus, drag/keyboard reordering wiring, and `Ctrl+Alt+S`.
- `src/ThreadTree.tsx` — a shelf flattened into compact rows with rail/elbow
  connectors, a leading PR mark, and the shared trailing slot.
- `src/forest.ts` — the per-native-project display forest: cycle-safe,
  deterministic, cross-project aware, order-aware, plus shelf flattening. No
  React, so it is directly assertable.
- `src/thread-order.ts` / `src/useThreadOrders.ts` — the persistent sibling
  order overlay and its compare-and-set client.
- `src/useReorderDrag.ts` — pointer drag with a vertical threshold, live
  reorder, pressed-click suppression, and Escape cancel.
- `src/PullRequestMark.tsx` — the Dray-style open/draft/merged/closed mark
  driven by the host's cached per-thread pull request.
- `src/lifecycle.ts` / `src/useLifecycle.ts` — the settled classifier and the
  store client with honest loading/error status, centralized mutations, and
  retry.
- `src/collapse.ts` — per-client project folds, settled-section state, and the
  saved filter choice (localStorage), never server state.
- `src/InlineThreadTitle.tsx`, `src/RowContextMenu.tsx`,
  `src/StatusGlyph.tsx`, `src/StatusSlot.tsx`, `src/relative-time.ts`,
  `src/inbox.ts`, `src/settle-shortcut.ts` — supporting UI and helpers.
- `components/ui/` — vendored shadcn source you own, including the shared
  `Icon`, coarse-pointer sizing tokens, and a compact `Select`.

## Build

```
npm install        # dependencies are already installed in this checkout
npm run typecheck  # tsc --noEmit
npm run build      # bb plugin build -> dist/
```

`bb plugin build` writes `dist/app.js`, `dist/app.css`, `dist/server.js` and
their `*.meta.json`. The plugin id is `project-sidebar`.

## Install and reload

```
bb plugin install .
bb plugin reload project-sidebar
```

Or let `bb plugin dev` rebuild and reload on every save.

## Behavior notes

- Project membership is authoritative. A thread is drawn under its own
  `projectId`; a child whose parent lives in another project stays in its own
  project and gets a compact parent link for navigation. Every known project
  gets a section in BB's order, including empty ones. Each unknown project id
  gets its own section (named by id).
- The personal container is labelled **Threads** from `isPersonal` metadata,
  not by matching a name; it stays BB's implicit personal project internally.
- The display forest is acyclic and total: deterministic roots, deterministic
  child order, every member visited once. A parent cycle is broken by drawing
  the earliest member as a root. Native parent ids are never changed.
- A compact filter at the top offers **All projects**, every native project,
  and **Threads**. It filters active and settled work together; a saved choice
  whose project is gone reconciles to All once data is ready.
- Settling and restoring act on exactly one thread. A settled child moves to
  its group's Settled section (with a parent link when its parent stayed
  active); restoring reattaches it under its active ancestor. Settled work
  stays reachable under every filter.
- Drag a project heading to reorder projects, or a thread to reorder it among
  its siblings. Drops never reparent a thread or move it between projects.
  Pinned threads form their own partition and drag only within it; pin state is
  never changed by reordering. `Alt+ArrowUp/Down` moves the focused row or
  project as a keyboard alternative, and a click after a drag is suppressed.
- The leading mark is a real pull request only (open/draft/merged/closed, with
  a failing check recolouring it). No PR, branch, or provider state is
  fabricated.
- Settling or restoring never archives, deletes, stops an agent, or cleans a
  worktree. The plugin's database records a settled time and an optional order.
- Live work and pending interactions block parking, and attention newer than a
  settle resurfaces the thread. Parking eligibility considers every real
  descendant, including cross-project children.
- Lifecycle controls only appear when the store is `ready`. Each action is
  suppressed while in flight, failures surface as a toast plus an inline bar
  with Retry (load) or Dismiss (mutation), and every successful write triggers
  a fresh read.
- Active-thread reveal happens once per navigation (and once when the store
  finishes loading), then user folding is respected.
- Native navigation is preserved: rows carry BB's thread-shortcut hooks and
  split props, `aria-current` marks the selected row, `onNavigate` closes the
  mobile drawer, and coarse-pointer rows/controls grow while desktop stays
  compact.
- Snooze was removed. Any old snoozed records are migrated to active on load;
  settled records are preserved.
- The list registers no thread header actions, so it does not conflict with
  Inbox Sidebar's `ParentChip` / `SubagentsChip` registrations.

## Attribution

Portions of `src/` and `components/ui/select.tsx` are derived from
[bb-plugin-thread-inbox](https://github.com/wy3z/bb-plugin-thread-inbox)
(MIT, Copyright (c) 2026 Michael Yong). See `THIRD-PARTY-NOTICES.md`.
