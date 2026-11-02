// Sidebar navigation APIs from @get-bb/plugin-sdk 0.6. This plugin is still
// pinned to SDK 0.4.47 for its other APIs, but BB supplies the live SDK at
// runtime, so these exports exist when the bundle loads; only their types are
// missing from the pinned package. Declared here, from the 0.6.104 types,
// until the plugin migrates to SDK 0.6.
import type { ComponentType, ReactElement } from "react";
import * as sdk from "@get-bb/plugin-sdk/app";

export type SidebarNavigationIconRef =
  | { kind: "host"; name: "extensions" | "new-thread" | "search" | "skills" }
  | { kind: "plugin"; pluginId: string; icon: string | null };

export type SidebarNavigationAction =
  | { kind: "new-thread" }
  | { kind: "search-threads" }
  | { kind: "open-extensions" }
  | { kind: "open-skills" }
  | { kind: "open-plugin-panel"; pluginId: string; panelId: string };

export interface SidebarNavigationItem {
  id: string;
  label: string;
  icon: SidebarNavigationIconRef;
  action: SidebarNavigationAction;
  isDisabled: boolean;
  isVisible: boolean;
  isLoading: boolean;
  pluginId: string | null;
  shortcut: { label: string; ariaKeyShortcuts: string } | null;
  badge: { label: string } | null;
}

type Target = "current" | "split" | "tab";

export interface SidebarNavigationState {
  items: readonly SidebarNavigationItem[];
  activeItemId: string | null;
  isHomeActive: boolean;
  isShortcutModifierHeld: boolean;
  actions: {
    activate(itemId: string, options: { target: Target }): void;
    goHome(options?: { target: Exclude<Target, "split"> }): void;
    setVisible(itemId: string, isVisible: boolean): void;
    setOrder(itemIds: readonly string[]): void;
    openCustomize(): void;
    openDetails(itemId: string): void;
    disablePlugin(itemId: string): Promise<void>;
  };
}

export interface ExperimentalSidebarHeaderProps {
  width: number;
  controlSize: number;
  isCompactViewport: boolean;
}

export interface ExperimentalSidebarNavigationProps {
  isCompactViewport: boolean;
  placement: "list" | "rail";
}

export interface SidebarNavigationRegistration {
  id: string;
  title: string;
  description?: string;
  placement?: "list" | "rail";
  component: ComponentType<ExperimentalSidebarNavigationProps>;
  headerComponent?: ComponentType<ExperimentalSidebarHeaderProps>;
}

interface IconProps {
  name: string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

const live = sdk as unknown as {
  experimental_Icon: (props: IconProps) => ReactElement | null;
  experimental_SidebarNavigationIcon: (props: {
    icon: SidebarNavigationIconRef;
    className?: string;
  }) => ReactElement | null;
  experimental_useSidebarNavigation: () => SidebarNavigationState;
};

export const Icon = live.experimental_Icon;
export const SidebarNavigationIcon = live.experimental_SidebarNavigationIcon;
export const useSidebarNavigation = (): SidebarNavigationState =>
  live.experimental_useSidebarNavigation();

/** `app.slots.experimental_sidebarNavigation`, typed for SDK 0.4.47. */
export function registerSidebarNavigation(
  slots: unknown,
  registration: SidebarNavigationRegistration,
): void {
  (
    slots as {
      experimental_sidebarNavigation(r: SidebarNavigationRegistration): void;
    }
  ).experimental_sidebarNavigation(registration);
}
