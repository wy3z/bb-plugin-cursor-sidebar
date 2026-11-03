import { useSyncExternalStore } from "react";
import { experimental_useProviders as useProviders } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

/**
 * The agent provider's logo (Claude, Cursor, Codex, ...) before a thread
 * title, drawn as a tinted mask of the logo bb serves for that provider.
 * Renders nothing while the directory loads or for a provider with no logo.
 */
export function ProviderMark({ providerId, className }: { providerId: string; className?: string }) {
  const { providers } = useProviders();
  const dark = useDarkTheme();
  const provider = providers.find((entry) => entry.id === providerId);
  if (!provider?.logoUrl) return null;
  const tint = provider.strings?.iconTint ?? null;
  const mask = `url("${provider.logoUrl}") center / contain no-repeat`;
  return (
    <span
      role="img"
      aria-label={provider.displayName}
      title={provider.displayName}
      className={cn("cs-provider-mark pointer-events-none inline-block size-3.5 shrink-0", className)}
      style={{
        backgroundColor: tint ? (dark ? tint.dark : tint.light) : "currentColor",
        mask,
        WebkitMask: mask,
      }}
    />
  );
}

const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | null = null;

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  if (themeObserver === null) {
    themeObserver = new MutationObserver(() => {
      for (const notify of themeListeners) notify();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  return () => {
    themeListeners.delete(listener);
    if (themeListeners.size === 0) {
      themeObserver?.disconnect();
      themeObserver = null;
    }
  };
}

function readDarkTheme(): boolean {
  return document.documentElement.classList.contains("dark");
}

function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribeTheme, readDarkTheme, () => false);
}
