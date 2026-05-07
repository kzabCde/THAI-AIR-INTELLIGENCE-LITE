"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function TopNav() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <header className="mb-6 flex items-center justify-between rounded-2xl border border-white/20 bg-white/60 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/60">
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">แพลตฟอร์มข่าวกรองคุณภาพอากาศ</p>
        <h1 className="text-lg font-semibold">Thailand Air Intelligence</h1>
      </div>
      <Button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="gap-2">
        {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {resolvedTheme === "dark" ? "Light" : "Dark"}
      </Button>
    </header>
  );
}
