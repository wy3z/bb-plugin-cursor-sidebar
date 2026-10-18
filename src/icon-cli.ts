// `bb cursor-sidebar icon …` — set a project icon from a shell, so a chat can
// draw one and apply it without the picker. Runs in the plugin server, so a
// file path is read on the BB server's machine, resolved against the caller's
// working directory.
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { PROJECT_ICON_NAMES } from "./project-icons";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Raw bytes that still fit the server's 256KB data-URL cap once base64'd. */
const MAX_PNG_BYTES = 192 * 1024;
/** The heading draws 14px; anything past this is wasted storage. */
const MAX_PNG_EDGE = 1024;

const USAGE = `Usage: bb cursor-sidebar icon <command> [--project <id|name>]

Commands:
  set <file.png>   Use a PNG as the project icon (transparency is kept)
  glyph <Name>     Use a built-in glyph, e.g. Rocket. "glyph --list" lists them
  clear            Go back to the folder
  get              Print what the project currently wears

Without --project, the calling chat's project is used.
For a PNG: square, 64 to 256px, transparent background, under 192KB.`;

type IconStore = {
  read: (projectId: string) => string | null;
  /** Write (or clear with null) and tell open sidebars to reload. */
  save: (projectId: string, icon: string | null) => void;
};

type CliResult = { exitCode: number; stdout?: string; stderr?: string };

const fail = (message: string): CliResult => ({ exitCode: 1, stderr: `${message}\n` });

export function registerIconCli(bb: BbPluginApi, store: IconStore): void {
  bb.cli.register({
    name: "cursor-sidebar",
    summary: "Cursor Sidebar: set project icons",
    commands: [
      {
        name: "icon",
        summary: "Set, clear or show a project icon: a PNG (transparency kept) or a built-in glyph",
        usage: "bb cursor-sidebar icon <set <file.png> | glyph <Name|--list> | clear | get> [--project <id|name>]",
      },
    ],
    async run(argv, ctx) {
      const args = [...argv];
      let projectArg: string | null = null;
      const flag = args.findIndex((arg) => arg === "--project" || arg === "-p");
      if (flag !== -1) {
        projectArg = args[flag + 1] ?? null;
        if (projectArg === null) return fail("--project needs a project id or name.");
        args.splice(flag, 2);
      }
      const [group, command, value] = args;
      if (group !== "icon" || command === undefined || command === "help" || command === "--help") {
        return { exitCode: group === undefined || command === "help" || command === "--help" ? 0 : 1, stdout: `${USAGE}\n` };
      }

      if (command === "glyph" && value === "--list") {
        return { exitCode: 0, stdout: `${PROJECT_ICON_NAMES.join("\n")}\n` };
      }

      const project = await resolveProject(bb, projectArg ?? ctx.projectId ?? null);
      if (typeof project === "string") return fail(project);

      switch (command) {
        case "get": {
          const icon = store.read(project.id);
          const shown = icon === null ? "folder (default)" : icon.startsWith("data:") ? "uploaded image" : `glyph ${icon}`;
          return { exitCode: 0, stdout: `${project.name}: ${shown}\n` };
        }
        case "clear":
          store.save(project.id, null);
          return { exitCode: 0, stdout: `${project.name}: icon reset to the folder.\n` };
        case "glyph": {
          if (value === undefined) return fail("Name a glyph, or run `glyph --list`.");
          const name = PROJECT_ICON_NAMES.find((glyph) => glyph.toLowerCase() === value.toLowerCase());
          if (name === undefined) return fail(`Unknown glyph "${value}". Run \`bb cursor-sidebar icon glyph --list\`.`);
          store.save(project.id, name);
          return { exitCode: 0, stdout: `${project.name}: icon set to ${name}.\n` };
        }
        case "set": {
          if (value === undefined) return fail("Give a PNG file path.");
          const path = isAbsolute(value) ? value : resolve(ctx.cwd ?? process.cwd(), value);
          let bytes: Buffer;
          try {
            bytes = await readFile(path);
          } catch {
            return fail(`Could not read ${path} on the BB server.`);
          }
          const problem = checkPng(bytes);
          if (problem !== null) return fail(problem);
          store.save(project.id, `data:image/png;base64,${bytes.toString("base64")}`);
          return { exitCode: 0, stdout: `${project.name}: icon set from ${path}.\n` };
        }
        default:
          return { exitCode: 1, stderr: `Unknown command "${command}".\n\n${USAGE}\n` };
      }
    },
  });
}

/** A project id or a case-insensitive name; a string result is the error. */
async function resolveProject(
  bb: BbPluginApi,
  wanted: string | null,
): Promise<{ id: string; name: string } | string> {
  if (wanted === null) return "No project: pass --project <id|name>, or run this from a chat.";
  try {
    const project = await bb.sdk.projects.get({ projectId: wanted });
    return { id: project.id, name: project.name };
  } catch {
    // Not an id; fall through to a name match.
  }
  const projects = await bb.sdk.projects.list();
  const matches = projects.filter((project) => project.name.toLowerCase() === wanted.toLowerCase());
  if (matches.length === 1) return { id: matches[0]!.id, name: matches[0]!.name };
  if (matches.length > 1) return `More than one project is named "${wanted}"; pass its id instead.`;
  return `No project matches "${wanted}".`;
}

/** Null when the bytes are a PNG the sidebar can store; otherwise why not. */
function checkPng(bytes: Buffer): string | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    return "That file is not a PNG.";
  }
  if (bytes.length > MAX_PNG_BYTES) {
    return `That PNG is ${Math.round(bytes.length / 1024)}KB; keep it under ${MAX_PNG_BYTES / 1024}KB (64 to 256px is plenty).`;
  }
  // IHDR is always the first chunk: width and height follow its type tag.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width > MAX_PNG_EDGE || height > MAX_PNG_EDGE) {
    return `That PNG is ${width}x${height}; keep each side at ${MAX_PNG_EDGE}px or less (64 to 256px is plenty).`;
  }
  return null;
}
