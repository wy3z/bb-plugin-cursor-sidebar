import { cn } from "@/lib/utils";
import { projectIconColorClassName, type ProjectIconColor } from "./project-icons";

const monogramSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * A project's letter tile: currentColor text on a 14% currentColor background,
 * rounded to 25%. Ported from T3 Code's ProjectMonogram. Drawn as an SVG so it
 * scales cleanly from a 14px row slot to the 48px preview.
 */
export function ProjectMonogram({
  text,
  color,
  className,
}: {
  readonly text: string;
  readonly color: ProjectIconColor;
  readonly className?: string | undefined;
}) {
  const segments = Array.from(monogramSegmenter.segment(text));
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}
    >
      <svg
        viewBox="0 0 16 16"
        className={cn(
          "size-full overflow-hidden rounded-[25%] font-mono select-none",
          projectIconColorClassName(color),
        )}
        style={{ backgroundColor: "color-mix(in srgb, currentColor 14%, transparent)" }}
      >
        <text
          x="8"
          y="10.8"
          textAnchor="middle"
          fill="currentColor"
          className="font-mono"
          fontSize="8.25"
          fontWeight="700"
          textLength={segments.length === 1 ? 6 : 12}
          lengthAdjust="spacingAndGlyphs"
          textRendering="geometricPrecision"
        >
          {text}
        </text>
      </svg>
    </span>
  );
}
