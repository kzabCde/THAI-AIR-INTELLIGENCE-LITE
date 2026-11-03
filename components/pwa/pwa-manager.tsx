"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

/**
 * Background PWA initializer: registers Service Worker and tracks standalone state
 * without rendering any intrusive floating banners.
 */
export function PwaManager() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* ignore registration errors */
      });
    }

    const syncStandalone = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      document.documentElement.toggleAttribute("data-standalone", standalone);
    };

    syncStandalone();
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    mediaQuery.addEventListener?.("change", syncStandalone);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      notifyListeners();
    };

    const onAppInstalled = () => {
      globalDeferredPrompt = null;
      document.documentElement.setAttribute("data-standalone", "true");
      notifyListeners();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      mediaQuery.removeEventListener?.("change", syncStandalone);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  return null;
}

/**
 * Subtle, inline footer action that only appears when the browser offers native PWA installation.
 */
export function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const sync = () => setPromptEvent(globalDeferredPrompt);
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  if (!promptEvent) return null;

  async function handleInstall() {
    if (!globalDeferredPrompt) return;
    try {
      await globalDeferredPrompt.prompt();
      await globalDeferredPrompt.userChoice;
    } catch {
      /* ignore */
    } finally {
      globalDeferredPrompt = null;
      notifyListeners();
    }
  }

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="inline-flex items-center gap-1 font-semibold text-zinc-600 transition hover:text-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:text-zinc-300 dark:hover:text-teal-400"
    >
      <Download size={12} />
      <span>ติดตั้งแอป</span>
    </button>
  );
}
