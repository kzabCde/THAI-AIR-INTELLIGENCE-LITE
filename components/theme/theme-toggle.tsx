"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "isan-theme";
const LIGHT_THEME_COLOR = "#f8fafc";
const DARK_THEME_COLOR = "#020617";

export function applyTheme(theme: "light" | "dark") {
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  const color = isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length > 0) {
    metas.forEach((m) => {
      m.removeAttribute("media");
      m.setAttribute("content", color);
    });
  } else {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    document.head.appendChild(meta);
  }
}

/** No-flash script injected before hydration to set the initial theme and status bar color. */
export const themeInitScript = `(()=>{try{var t=localStorage.getItem('${KEY}');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'${DARK_THEME_COLOR}':'${LIGHT_THEME_COLOR}');}catch(e){}})();`;

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next ? "dark" : "light");
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="สลับธีมสว่าง/มืด"
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border hover:bg-surface-2"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
