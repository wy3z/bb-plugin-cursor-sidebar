// bb-plugin-cursor-sidebar — a project-grouped sidebar replacement.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never
// bundled), so this file must be loaded by BB, not imported directly.
import "./app.css";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { CursorSidebar } from "./src/CursorSidebar";

// Register only the sidebar replacement. It deliberately ships no thread
// header actions, so it never duplicates the ones Inbox Sidebar adds.
export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "cursor-sidebar",
    title: "Cursor Sidebar",
    description:
      "A Cursor-style sidebar: project trees, standalone chats, pins, folders and aggregate activity.",
    component: CursorSidebar,
  });
});
