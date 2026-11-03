import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ProjectIconMark } from "./ProjectIconMark";
import type { ProjectIcon } from "./project-icons";

/**
 * BB's composer names the project with a plain folder glyph in three places:
 * the label under a thread's prompt box, the project button on the New
 * thread screen and that button's project picker. BB has no project icon field, so this paints the sidebar's
 * chosen icon over that folder. Projects without an icon keep BB's folder.
 */

/** Elements whose text names the project, and where their folder glyph sits. */
const TARGET_SELECTOR = [
  '[data-follow-up-composer-footer] [data-option-display][title^="Project: "]',
  '[data-new-thread-footer] button[aria-label^="Project: "]',
  // BB's project picker rows, which carry the project id directly.
  '[role="dialog"][aria-label="Project"] [cmdk-item][data-value^="proj_"]',
].join(", ");

const HOST_ATTRIBUTE = "data-cs-composer-project-icon";
const MARKED_ATTRIBUTE = "data-cs-has-project-icon";

interface Target {
  key: string;
  host: HTMLElement;
  projectId: string;
}

function projectNameOf(element: Element): string {
  const label = element.getAttribute("title") ?? element.getAttribute("aria-label") ?? "";
  return label.replace(/^Project:\s*/, "").trim();
}

let nextKey = 0;

export function ComposerProjectIcons({
  enabled,
  projects,
  iconFor,
}: {
  enabled: boolean;
  projects: ReadonlyArray<{ id: string; name: string; isPersonal: boolean }>;
  iconFor: (projectId: string) => ProjectIcon | null;
}) {
  // Name to id, dropping names two projects share: the label is all we have.
  const idByName = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const project of projects) {
      if (project.isPersonal) continue;
      map.set(project.name, map.has(project.name) ? null : project.id);
    }
    return map;
  }, [projects]);

  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    const clear = () => {
      Array.from(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).forEach((host) => host.remove());
      Array.from(document.querySelectorAll(`[${MARKED_ATTRIBUTE}]`)).forEach((marked) =>
        marked.removeAttribute(MARKED_ATTRIBUTE),
      );
    };
    if (!enabled) {
      clear();
      setTargets([]);
      return;
    }

    let frame = 0;
    const scan = () => {
      frame = 0;
      const next: Target[] = [];
      for (const element of Array.from(document.querySelectorAll(TARGET_SELECTOR)) as HTMLElement[]) {
        const value = element.getAttribute("data-value");
        const projectId = value?.startsWith("proj_")
          ? value
          : idByName.get(projectNameOf(element)) ?? null;
        const folder = element.querySelector(':scope [data-icon="Folder"]') as HTMLElement | null;
        let host = element.querySelector(`[${HOST_ATTRIBUTE}]`) as HTMLElement | null;
        if (projectId === null || iconFor(projectId) === null || folder === null) {
          host?.remove();
          element.removeAttribute(MARKED_ATTRIBUTE);
          continue;
        }
        if (host === null) {
          host = document.createElement("span");
          host.setAttribute(HOST_ATTRIBUTE, String(++nextKey));
          host.style.display = "inline-flex";
          host.style.flexShrink = "0";
          folder.before(host);
        }
        element.setAttribute(MARKED_ATTRIBUTE, "");
        next.push({ key: host.getAttribute(HOST_ATTRIBUTE)!, host, projectId });
      }
      setTargets((current) =>
        current.length === next.length &&
        current.every((t, i) => t.host === next[i]!.host && t.projectId === next[i]!.projectId)
          ? current
          : next,
      );
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(scan);
    };

    // The footers re-render on navigation and when the project changes; watch
    // the tree and the two attributes that carry the project name.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["title", "aria-label"],
    });
    scan();
    return () => {
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
      clear();
    };
  }, [enabled, idByName, iconFor]);

  return (
    <>
      {targets.map((target) =>
        createPortal(
          <ProjectIconMark
            icon={iconFor(target.projectId)}
            fallback="Folder"
            className="size-3.5"
            mutedClassName="text-muted-foreground"
          />,
          target.host,
          target.key,
        ),
      )}
    </>
  );
}
