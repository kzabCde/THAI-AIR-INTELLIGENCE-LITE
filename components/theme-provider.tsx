"use client";

import { storage } from "@/lib/storage";
import { useEffect } from "react";

export function ThemeProvider() {
  useEffect(() => {
    if (storage.getDarkMode()) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return null;
}
