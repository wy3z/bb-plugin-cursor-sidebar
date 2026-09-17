# Project Sidebar for BB

A replacement thread list: native BB projects, nested children, standalone chats, pins, folders, and aggregate activity. No Cores, no Project Managers, no worker orchestration.

## What you get

Managed native projects keep their headings and collapsed child trees. Click the heading to expand or collapse. Expanded rows follow actual native ancestry with connecting rails.

Each project heading has a status indicator in a fixed slot: BB's stock `Loading` spinner while any member or descendant works, `AlertTriangle` when pending user input needs attention, otherwise a quiet folder glyph. Thread rows draw the same leading slot (host status glyph while the thread has something to say, read dot otherwise) and trail relative age. Reduced motion stops the spinner.

Standalone chats appear under recency labels (Pinned, Today, Yesterday, Last 7 days, Last 30 days, Older), without a visible Chats heading when grouped by date. Secondary information uses real workspace, repository, branch and host metadata.

## Pinned chats and folders

Standalone chats can be pinned or filed into named folders. Both use BB's native thread state: pinning flips the thread's native pin, folders are BB's native named thread sections. One family shows in exactly one place: pinned first, then its folder, then its date group.

A family is filed and pinned by its root: dragging, pinning or moving any reply carries its whole family. Drag a family onto a folder heading to file it, onto the Pinned heading to pin it, or onto a date divider to return it to the dated chats. `Alt+ArrowUp/Down` reorders within one cluster. Folder headings offer Rename and Delete. Deleting a folder returns its chats to the dated groups and keeps pins.

## Controls

Project visibility and expansion are saved per client. A new project starts collapsed. Drag within a sibling group to reorder, or use **Alt+ArrowUp/Down**. Project ordering uses a plugin overlay rather than changing native storage.

A `+` on the Projects heading opens **New project**, which picks a host folder and creates (or reuses) a native BB Project. The Projects control keeps project visibility, grouping, and gesture help.

The SDK cannot change a thread's native project membership, so this plugin does not move chats between projects.

## Phone and touch

At phone widths or with coarse pointers, project headings show the activity spinner, thread rows keep trailing status, and both show name and compact workspace detail. Hold a project for 550ms to expand/collapse; hold a leaf for actions. Swipe left archives; swipe right pins. Keyboard users have named Actions controls and Shift+F10.
