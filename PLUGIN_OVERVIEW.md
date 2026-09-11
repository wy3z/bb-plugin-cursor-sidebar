Keep threads filed under the BB project they belong to, with their child
threads nested in place and a settled shelf in each group.

## What you get

- **Project headings in BB's own order**, including projects with nothing in
  them yet. The personal container is named **Threads**. Each heading folds,
  and the plus button starts a new thread in that project using BB's composer.
- **A compact filter** at the top: All projects, each native project, and
  Threads. It narrows active and settled work together.
- **Ordinary threads with nested children.** A spawned or forked thread hangs
  under the thread that produced it, drawn with faint rail and elbow
  connectors, and grandchildren hang under their own parents. Pinned threads
  lead their siblings and never leave their project.
- **A leading pull-request mark** when a real PR is known, in the usual open,
  draft, merged and closed colours, with a failing check recolouring the mark.
  Nothing is shown when there is no pull request.
- **A settled shelf inside each group.** Settling files a quiet thread out of
  the way without archiving it, deleting it, stopping an agent, or touching a
  worktree. The shelf is collapsed with a count until you open it, and Restore
  puts the exact thread back in its active place.
- **Settle a child by itself.** Every quiet row has its own settle and restore
  control, and a parked child sits in its group's shelf with a small parent
  link when its parent stayed active. A busy descendant blocks settling its
  ancestors, and live work or new attention brings parked threads back.
- **Reorder by dragging.** Drag a project heading to move the project, or a
  thread to move it among its siblings. Drop placement is visible as you drag,
  `Alt+ArrowUp/Down` moves the focused row, and reordering never reparents a
  thread or changes a pin. Dragging a row out toward the chat still opens it in
  a split.

## How it works

The sidebar reads BB's live thread and project view directly, so it always
matches what BB itself shows. A thread is drawn under its own project, and
project identity, thread ids, and parent links stay authoritative. A child
whose parent is missing, archived, or in another project is still shown in its
own project; a parent link keeps the relationship navigable. Parent cycles are
broken deterministically, so no thread is ever dropped.

Settled state and sibling order live in this plugin's own storage on the BB
server, never on the thread. Uninstalling the plugin removes them with it. The
fold state, the open settled sections, and the filter choice are remembered per
client.

## Daily use

Right-click a row to open it in a split, rename it, mark it read, pin it,
archive it, or delete it. Double-click a title to rename it in place.
`Ctrl+Alt+S` settles the active thread. Hovering a row swaps its age for the
pin and settle controls, and opening a thread from anywhere expands its
project, shelf, and ancestors.

## For agents

The sidebar is a view over BB's own threads, so an agent works with threads the
ordinary way. There is no separate project database, note store, or
orchestration layer to learn, and the plugin adds no commands of its own.
