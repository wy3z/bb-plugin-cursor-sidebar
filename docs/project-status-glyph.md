# Project status indicator: native BB treatment + sidebar cleanup

Supersedes the abandoned sparse-dot-matrix / lattice glyph. The project heading
indicator is now composed **only of existing BB `Icon` primitives**, and this
pass also folds in the user's sidebar cleanup tasks. Implemented in the dirty
`bb-plugin-project-sidebar` checkout; no commits, packages, service changes,
native thread mutations, or deletions.

Mission thread `thr_yhbfybjrux`. The lattice SVG/cells/weave CSS and its
exploration artifacts were removed; historical research records are kept but
the current docs describe the native treatment.

## Indicator decision

One always-present left slot on project headings and thread rows alike.
Thread rows draw the host status glyph while the thread has something to say,
else the read dot, and always trail the relative age.

| State | Primitive | Tone |
| --- | --- | --- |
| inactive | `Icon name="Circle"` (subtle outline ring) | `text-muted-foreground/40` |
| working | `Icon name="Loading"` (stock spinner, unchanged) | `text-muted-foreground/50` + `animate-spin` |
| complete | `Icon name="CircleCheck"` | `text-foreground` |
| attention / issue | `Icon name="AlertTriangle"` | `text-warning-text` |

Greyscale except the native warning tone. No custom geometry, grid, morph,
dashed/spinner recreation, canvas, dependency or animation system.

### Resting/resolved prototype

Rendered four candidate pairs in real sidebar rows at 12/14/16px DPR1
(`resting-resolved-prototype.html` / `.png`):

- **A ring→check** (chosen): outline ring → `CircleCheck`. Same circular
  silhouette, unambiguous resolved mark, legible at 12px.
- **B dot→check**: 5px dot resting mark reads as a notification dot and the
  shape family changes; the dot nearly vanishes at 12px.
- **C ring→disc**: a filled disc is the most minimal "filled equivalent" but
  the hollow-vs-solid difference is easy to miss at 14px.
- **D ring→bright ring**: tone-only change is too subtle to mean "complete".

A won on clarity, native vocabulary and the 14px default.

### Working parity (verified, not assumed)

The brief warned not to claim stock parity from the plugin's own `/70` copy.
Checked both the installed app and live DOM:

- Installed BB 0.42.1 asset `index-BQPw79B3.js` defines the native sidebar
  working tone as `text-muted-foreground/50` (`/70` does not occur).
- Live: native thread spinners render
  `data-icon="Loading"`, `animate-spin`, `text-muted-foreground/50`,
  `size-4 max-md:size-5 pointer-coarse:size-5`, computed `oklab(0.78 0 0 / 0.5)`.
- The project indicator renders the same `data-icon="Loading"`, `animate-spin`,
  `text-muted-foreground/50`, `size-4` and computed `oklab(0.78 0 0 / 0.5)`.

The thread runtime spinner now matches this tone and size (`size-4`,
`text-muted-foreground/50`) in the same fixed 16px slot. The remaining 14px
error/waiting glyphs sit inside the 16px slot unchanged.

### Issue primitive

`AlertTriangle` (`text-warning-text`) is BB's generic needs-attention glyph
(`SidebarPluginAttentionGlyph`). `CircleQuestion` is the thread-level
pending-input glyph; the project row uses the generic attention marker instead
of inventing a warning. No pending interaction was manufactured for evidence.

## Truth and precedence (preserved)

- `activityStateFor`: `attention > working > complete > inactive`.
- Aggregate working/attention still covers every non-archived member and
  descendant (Project Manager, children, background work).
- `projectComplete = !projectReview && projectHasCompletedWork(...)` — an
  outstanding review still cannot let stale accepted history present as
  complete. Internal worker acceptance is unchanged and the `reviewRequired`
  field is still consumed; only its routine badge was removed.
- No lifecycle redesign; resolved failures are not resurrected.

## Sidebar cleanup folded into this pass

1. **Projects filter/sliders control + hover create** — removed the
   `SlidersHorizontal` glyph and replaced it with a native `Plus` create action
   at the right of the Projects header. It is hidden at rest, revealed on
   desktop hover or focus (including `:focus-within`), and always visible with a
   ≥44px target on touch/narrow widths. It carries `aria-label` / `title`
   "New project" and opens a small "New project — Choose a working directory."
   popover that lists native working directories; choosing one launches the
   existing managed Project creation flow (`ManagerCreate`). The `Projects`
   text button still opens the options popover (visibility checkboxes + gesture
   help); the old inline creation select was removed from it because creation
   now lives on the Plus.
2. **Project heading chevrons** — removed the `>` / `v` `ps-project-chevron`
   button. Expansion stays available through **double-click** (below), hold,
   the context/right-click Actions menu, and the keyboard Actions control
   (`Shift+F10`), which exposes "Expand children" / "Collapse children". Child
   trees remain collapsed by default (persistent expansion state, empty on
   first run). Child toggles for nested threads are unchanged.
3. **Double-click expands/collapses** — the heading uses native
   `onDoubleClick` to toggle the existing `expandedProjects` children state.
   Single mouse click / tap and keyboard (Enter/Space) activation are immediate:
   a managed heading opens the Project Manager; a fallback group without a
   Project Manager still toggles on click. For fallback groups the click handler
   ignores the second click of a double click (`event.detail > 1`) so
   click+click+dblclick nets a single toggle. There is no click timer, so two
   quick keyboard activations both act (they no longer cancel navigation). Only
   the heading button carries the handler, so the per-project `+`, Actions and
   other nested controls never toggle. The `aria-description` names double-click
   (plus hold, swipe, Actions and Shift+F10).
4. **Routine Review badge** — removed the non-blocking "Review" text badge.
   Pending input / blocking state is represented by the native attention
   signal (warning `AlertTriangle`). Internal worker acceptance is unchanged.

## Project Manager copy sweep

Current user-visible copy, comments, tooltips/aria and README use the
canonical **Project Manager** role name: delete dialog, create dialog +
status/errors, "Open Project Manager" action, "New Project Manager in a working
directory" label, review tooltip/aria (now removed with the badge), settle
error, and README. Persisted schema/API identifiers
(`coordinatorThreadId`, `coordinator_thread_id`, the `coordinator` role enum,
RPC method names) are intentionally unchanged. Residual search:
`rg -i "\bcoordinator\b" src/` returns only those camelCase/snake identifiers.

## Files

- `src/ProjectStatusGlyph.tsx` (rewritten): `ActivityState`,
  `ACTIVITY_LABELS`, `activityStateFor`, `ProjectStatusGlyph` built from
  `Circle` / `Loading` / `CircleCheck` / `AlertTriangle`.
- `app.css`: replaced the lattice cell/weave block with a minimal fixed 16px
  slot and a `prefers-reduced-motion` rule that stops the spinner; removed the
  dead `.ps-project-chevron` mobile selector; added `.ps-project-header` hover/
  focus reveal rules for `.ps-new-project` and a later, higher-specificity
  touch/narrow override so the cascade can never hide it on mobile.
- `src/ProjectSidebar.tsx`: removed the chevron button and Review badge and the
  now-dead `projectReview` prop; immediate single-click activation + native
  `onDoubleClick` toggle (no timer); header uses `.ps-project-header` and
  renders `NewProjectAction`; double-click added to `aria-description`.
- `src/NewProjectAction.tsx` (new): native `Plus` trigger + "New project"
  working-directory popover.
- `src/ProjectChecklist.tsx`: removed the sliders glyph, the `creationControl`
  prop and its unused `ReactNode` import.
- `src/ManagerCreate.tsx`, `src/DeleteProjectDialog.tsx`, `src/server.ts`,
  `src/activity.ts`, `src/useProjectVisibility.ts`: Project Manager copy.
- `README.md`: native indicator + Project Manager wording.
- Later status-slot pass: thread rows gained the always-drawn leading slot
  (`RowStatusSlot` in `ThreadTree.tsx`, read dot + `ThreadAge` in
  `StatusSlot.tsx`, thread spinner at 16px/native tone in `StatusGlyph.tsx`)
  and the heading slot moved left of the project name. A completed project
  shows the idle glyph with an inactive label.

## Verification (live BB 0.42.1 at `localhost:38886`, isolated Chrome)

`npm run typecheck` and `npm run build` pass; only `project-sidebar` reloaded.
Built `dist/app.css` has zero `ps-glyph-cell`/`ps-glyph-weave`/
`ps-project-chevron`; the component uses only `Icon` primitives.

- Live project row: `data-icon="Loading"`, `animate-spin`, color
  `oklab(0.78 0 0 / 0.5)`, slot and svg 16px at x=12; `role="img"`, label
  "Project has working threads".
- Post-cleanup DOM at 1280/390/320: 0 `.ps-project-chevron`, 0
  `SlidersHorizontal` in the plugin, 0 "Review" spans. No horizontal overflow
  (doc 1280/390/320; plugin root 295/295 and 242/242 at 390/320).
- Expansion via the Actions menu works (keyboard/AT path): "Expand children"
   produced child rows; "Collapse children" returned to 0. At that time child
   rows showed no left glyphs and native trailing spinners/ages; the later
   status-slot pass added the leading slot and age-only trailing.
- Projects options popover still opens with visibility and help.
- **Plus create action cascade**: built CSS places the base
  `.ps-project-header .ps-new-project { opacity:0 }` before the
  `@media (max-width:767px),(pointer:coarse)` override, and the override has
  higher specificity. At 390 and 320 with focus on `BODY` and the pointer away,
  the button computes `opacity:1`, 44x44 (previously hidden by the equal-
  specificity later base rule). Clicking it opens the "New project" popover;
  choosing a working directory opens the existing `ManagerCreate` dialog
  (verified title + composer) — no real project was created.
- **Double-click (managed)**: at 1280 `dblclick` on the heading → child rows
  appear; a second `dblclick` → 0 rows. Also verified from another route (`/`):
  the dblclick was still delivered after the first click navigated to the
  Project Manager (rows 0 → 16), so navigation does not destroy dblclick
  delivery.
- **Single click / keyboard**: one click immediately navigates `/` →
  `/projects/proj_82ikwbeyqa/threads/thr_qxx6s47isp` without expanding; Enter on
  the focused heading also navigates; two quick Enters do not cancel each other
  (the old timer bug is gone).
- **Isolation**: double-clicking the per-project `+` or the Actions control
  leaves child rows at 0 (no accidental expand), and no `ps-project-chevron`
  exists (no arrows returned).
- Fallback groups without a Project Manager have no live instance to exercise;
  their click handler ignores `event.detail > 1` so click+click+dblclick nets a
  single toggle.

Screenshots (also under `$BB_THREAD_STORAGE/glyph-final/`):

- Resting/resolved prototype: `resting-resolved-prototype-dpr1.png`
- Four states, real icon primitives + plugin classes, 12/14/16 DPR1, with
  default/selected/hover rows and reduced motion (static working):
  `native-states-dpr1-dark-reduced.png`, `native-states-dpr1-light-reduced.png`,
  `native-states-dpr1-dark-normal.png` (spinning).
- Plus create action header on hover: `plus-hover-dark.png`,
  `plus-hover-light.png`; open menu: `new-project-menu-dark.png`.
- Live after cleanup: `cleanup-production-dark.png`, `cleanup-production-light.png`,
  `cleanup-production-expanded-dark.png`, `doubleclick-expanded-dark.png`,
  `cleanup-production-390-dark.png`, `cleanup-production-320-dark.png`.

Fixture disclosure: the four-state sheet is a temporary DOM fixture built from
the real Hugeicons path data and the plugin's own classes/tokens; it was
removed after capture. Dark/light came from browser colour-scheme emulation in
an isolated session; the user's theme preference was not changed.

## Limits

- Live sidebar currently exposes one working project, so inactive/complete/
  attention were verified with the disclosed fixture, not by manufacturing
  pending interactions or mutating real project outcomes.
- Fallback groups without a Project Manager were not present in the live
  sidebar, so their double-click path was verified by source logic
  (`event.detail <= 1`) rather than click exercise.
- The headless build reports neither `(pointer:fine)` nor `(pointer:coarse)`, so
  the `(pointer:coarse)` clause could not be emulated; the narrow-width branch
  (`max-width:767px`) of the same media query was verified at 390/320, and the
  built CSS shows the override at correct specificity/source order.
- At <=390px BB's native mobile shell overlays the plugin, so the plugin's own
  mobile layout could not be captured independently; the 390/320 screenshots
  show the native shell. DOM checks confirm the Plus is visible/44px, the plugin
  root has no overflow, and no removed controls return at those widths.
- Physical phones, VoiceOver and the coarse-pointer `size-5` native growth were
  not exercised (the fixed 16px slot intentionally does not grow).
