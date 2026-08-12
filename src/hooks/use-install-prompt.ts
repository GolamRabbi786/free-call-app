import { useCallback, useEffect, useState } from "react";

/**
 * The browser's beforeinstallprompt event, captured so the app can trigger
 * the "Install app" / "Add to Home screen" flow on demand.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Lets the UI offer a real "Download the app" action. When the browser
 * supports app installation (Android Chrome, desktop Chrome/Edge), the
 * install prompt is captured and can be shown on click. Otherwise the UI
 * should fall back to manual "Add to Home screen" instructions.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      // Don't show the browser's automatic mini-infobar; we trigger it ourselves.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    return choice.outcome === "accepted";
  }, [promptEvent]);

  return { canInstall: promptEvent !== null, install };
}
