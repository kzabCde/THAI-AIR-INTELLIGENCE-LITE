"use client";

import { storage } from "@/lib/storage";
import { useEffect } from "react";

function applyTheme(theme: "system" | "light" | "dark") {
  const isDarkSystem = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldUseDark = theme === "dark" || (theme === "system" && isDarkSystem);
  document.documentElement.classList.toggle("dark", shouldUseDark);
}

export function ThemeProvider() {
  useEffect(() => {
    const settings = storage.getSettings();
    applyTheme(settings.theme);
    document.documentElement.lang = settings.lang;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== "thai_air_settings_v1") return;
      const next = storage.getSettings();
      applyTheme(next.theme);
      document.documentElement.lang = next.lang;
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}

export { applyTheme };
