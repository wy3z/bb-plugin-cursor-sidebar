import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";

/**
 * The sidebar's own right-click menu. The plugin API ships no menu component
 * on purpose, so a replaced sidebar owns this surface. Every item is one call
 * on `experimental_useSidebarThreadActions`, and the destructive one is
 * `requestDelete`, which opens bb's confirmation rather than deleting a
 * subtree silently.
 *
 * Derived from bb-plugin-thread-inbox (MIT, Copyright (c) 2026 Michael Yong);
 * see THIRD-PARTY-NOTICES.md at the repository root.
 */
export function RowContextMenu({
  thread,
  onRename,
  onOpen,
  children,
}: {
  thread: PluginSidebarThread;
  onRename?: () => void;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const actions = useSidebarThreadActions();
  const scopeProps = usePortalScopeProps();

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          {...scopeProps}
          aria-label="Thread actions"
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Item
            onSelect={() => {
              actions.open(thread.id, { split: true });
              onOpen?.();
            }}
          >
            Open in split
          </Item>
          {onRename ? <Item onSelect={onRename}>Rename</Item> : null}
          <Separator />
          <Item
            onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
          >
            {thread.isUnread ? "Mark read" : "Mark unread"}
          </Item>
          <Item
            onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
          >
            {thread.isPinned ? "Unpin" : "Pin"}
          </Item>
          <Separator />
          <Item onSelect={() => actions.archive(thread.id)}>Archive</Item>
          <Item destructive onSelect={() => actions.requestDelete(thread.id)}>
            Delete
          </Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function Item({
  children,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive",
      )}
    >
      {children}
    </ContextMenu.Item>
  );
}

function Separator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}
