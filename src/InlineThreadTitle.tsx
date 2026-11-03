import {
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type PointerEventHandler,
} from "react";
import {
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { threadDisplayTitle, threadEditableTitle } from "./inbox";
import { useThreadMutations } from "./thread-actions";

/**
 * The row's title, which becomes an inline rename field on double-click.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */
export function InlineThreadTitle({
  thread,
  editing,
  onEditingChange,
  className,
  onClick,
  onPointerDown,
}: {
  thread: PluginSidebarThread;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  className?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
}) {
  const actions = useThreadMutations();
  const title = threadDisplayTitle(thread);
  const editableTitle = threadEditableTitle(thread);
  const [draft, setDraft] = useState(editableTitle);
  const finished = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  const userLeft = useRef(false);
  const selected = useRef(false);
  const reclaims = useRef(0);

  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target !== inputRef.current) userLeft.current = true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") userLeft.current = true;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [editing]);

  useEffect(() => {
    const entering = editing && !wasEditing.current;
    wasEditing.current = editing;
    // Seed the draft and take focus only on the transition into editing. A
    // realtime title echo mid-rename must not clobber what is being typed.
    if (!entering) return;
    setDraft(editableTitle);
    finished.current = false;
    userLeft.current = false;
    selected.current = false;
    reclaims.current = 0;
    // Commit-time autoFocus loses to the closing menu's focus restoration in
    // the same flush, leaving typed text nowhere; take focus after commit.
    inputRef.current?.focus({ preventScroll: true });
  }, [editing, editableTitle]);

  if (!editing) {
    return (
      <span
        className={cn(
          "pointer-events-auto relative z-10",
          className,
        )}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (matchMedia("(pointer: coarse)").matches) return;
          onEditingChange(true);
        }}
      >
        {title}
      </span>
    );
  }
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onEditingChange(false);
    const next = draft.trim();
    if (save && next && next !== editableTitle) {
      void actions.rename(thread.id, next);
    }
  };
  return (
    <input
      autoFocus
      ref={inputRef}
      aria-label={`Rename ${title}`}
      value={draft}
      onFocus={(event) => {
        if (selected.current) return;
        selected.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => {
        if (!userLeft.current && document.hasFocus() && reclaims.current < 3) {
          reclaims.current += 1;
          requestAnimationFrame(() => {
            if (!finished.current) inputRef.current?.focus({ preventScroll: true });
          });
          return;
        }
        finish(true);
      }}
      className={cn(
        "pointer-events-auto relative z-10 h-6 w-full min-w-0 rounded border border-border bg-background px-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring",
        className,
      )}
    />
  );
}
