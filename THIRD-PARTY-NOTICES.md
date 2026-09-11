# Third-party notices

Parts of `src/` in this plugin are derived from **bb-plugin-thread-inbox**
(https://github.com/wy3z/bb-plugin-thread-inbox), used with permission under
the MIT License. That project's checkout was treated as read-only; only source
was copied and adapted into this plugin's own package.

The following files contain adapted source from that project:

- `src/lifecycle.ts`
- `src/useLifecycle.ts`
- `src/inbox.ts`
- `src/forest.ts`
- `src/thread-order.ts`
- `src/useThreadOrders.ts`
- `src/useReorderDrag.ts`
- `src/relative-time.ts`
- `src/StatusGlyph.tsx`
- `src/StatusSlot.tsx`
- `src/Disc.tsx`
- `src/ChildThreadBadge.tsx`
- `src/InlineThreadTitle.tsx`
- `src/RowContextMenu.tsx`
- `src/ThreadTree.tsx`
- `src/AnimatedList.tsx`
- `src/ProjectSidebar.tsx`
- `src/settle-shortcut.ts`
- `src/server.ts` (the settled store and RPC contract)
- `components/ui/select.tsx`

## AutoAnimate

`src/vendor/auto-animate/` contains the installed AutoAnimate 0.9.0 runtime
and types copied from Inbox Sidebar's existing dependency. It is distributed
under the MIT License, copyright 2022 FormKit Inc.; the full license is in
`src/vendor/auto-animate/LICENSE`. No package installation was needed.

## Inbox Sidebar MIT License

Copyright (c) 2026 Michael Yong

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
