/**
 * Realtime channel names shared by the backend and the sidebar frontend.
 *
 * Frontend modules must take their channel names from here, never as values
 * from `./server`. The backend imports `@get-bb/plugin-sdk`, which ships as a
 * dev dependency: a git install prunes dev dependencies (`npm install
 * --omit=dev`) and the host only provides the SDK to the server bundle. A value
 * import of `./server` from any frontend module therefore drags the backend
 * into `app.js`, and the app build dies with `Could not resolve
 * "@get-bb/plugin-sdk"` — which builds fine locally, where the SDK is present.
 *
 * `import type` from `./server` stays safe: the types are erased before the
 * bundle is written.
 */
export const THREAD_ORDER_CHANNEL = "thread-order";
export const PROJECT_ICON_CHANNEL = "project-icon";
export const SIDEBAR_VIEW_CHANNEL = "sidebar-view";
export const THREAD_SECTIONS_CHANNEL = "thread-sections";
