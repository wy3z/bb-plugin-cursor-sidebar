import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ProjectIcon } from "./project-icons";
import { projectIconColorClassName } from "./project-icons";
import { ProjectMonogram } from "./ProjectMonogram";

/**
 * One project's identity at a fixed box size: a chosen glyph in its colour, an
 * emoji, a monogram tile, an uploaded image, or the caller's fallback glyph
 * (the folder, or a chat for personal rows). Colourless legacy glyphs keep the
 * caller's muted tone so older saved icons look unchanged.
 */
export function ProjectIconMark({
  icon,
  fallback,
  className,
  mutedClassName,
}: {
  icon: ProjectIcon | null;
  /** The glyph to draw when no icon is chosen. */
  fallback: IconName;
  /** The box size, e.g. "size-4" or "size-3.5". */
  className: string;
  /** The muted foreground a colourless legacy glyph keeps. */
  mutedClassName?: string | undefined;
}) {
  if (icon?.kind === "image") {
    return (
      <img
        src={icon.src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }

  if (icon?.kind === "emoji") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none [container-type:size]",
          className,
        )}
      >
        <span className="text-[length:80cqh] leading-none">{icon.emoji}</span>
      </span>
    );
  }

  if (icon?.kind === "monogram") {
    return <ProjectMonogram text={icon.text} color={icon.color} className={className} />;
  }

  return (
    <Icon
      name={icon?.kind === "glyph" ? icon.name : fallback}
      aria-hidden="true"
      strokeWidth={2}
      className={cn(
        "shrink-0",
        className,
        icon?.kind === "glyph" && icon.color !== undefined
          ? projectIconColorClassName(icon.color)
          : mutedClassName,
      )}
    />
  );
}
