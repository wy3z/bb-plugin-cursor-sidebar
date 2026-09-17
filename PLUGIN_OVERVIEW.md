Keep threads filed under the BB project they belong to, with their child
threads nested in place.

## What you get

- **Project headings in BB's own order**, including projects with nothing in
  them yet. The personal container is named **Chats**. Each heading folds,
  and the plus button starts a new thread in that project using BB's composer.
- **A compact view menu** at the top: grouping (Projects / Updated / Status /
  Environment), conversation order, metadata visibility, and filters.
- **Ordinary threads with nested children.** A spawned or forked thread hangs
  under the thread that produced it, drawn with faint rail and elbow
  connectors. Pinned threads lead their siblings and never leave their project.
- **A leading pull-request mark** when a real PR is known.
- **Standalone pins and folders** using BB's native pin and thread-section
  state. Filing never archives, deletes, or changes project membership.

## How it works

The sidebar reads BB's live thread and project view directly. A thread is
drawn under its own native project. Project identity, thread ids, and parent
links stay authoritative. This plugin does not create Cores, workers, or
managed membership.

Settled state, sibling order, project visibility and the shared view live in
this plugin's own storage on the BB server. Uninstalling the plugin removes
them with it. Fold state is remembered per client.

## Daily use

Right-click a row to open it in a split, rename it, mark it read, pin it,
archive it, or delete it. Double-click a title to rename it in place.
Hovering a row swaps its age for the pin control. Right-click a project
heading and choose **Set icon…** to give it a glyph, or **Use default** to
return it to the folder.
