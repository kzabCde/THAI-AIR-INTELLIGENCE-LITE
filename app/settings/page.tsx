"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { THAI_PROVINCES } from "@/lib/constants";
import { storage } from "@/lib/storage";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [favorite, setFavorite] = useState("");

  useEffect(() => {
    setDarkMode(storage.getDarkMode());
    setFavorite(storage.getFavorite());
  }, []);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    storage.setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const saveFavorite = (slug: string) => {
    setFavorite(slug);
    storage.setFavorite(slug);
  };

  const resetLocal = () => {
    storage.reset();
    setDarkMode(false);
    setFavorite("");
    document.documentElement.classList.remove("dark");
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card className="space-y-3">
        <h2 className="font-semibold">Dark mode</h2>
        <Button onClick={toggleDark}>{darkMode ? "Disable" : "Enable"} Dark Mode</Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Favorite Province</h2>
        <select value={favorite} onChange={(e) => saveFavorite(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-transparent p-2">
          <option value="">None</option>
          {THAI_PROVINCES.map((p) => <option key={p.slug} value={p.slug}>{p.province}</option>)}
        </select>
      </Card>

      <Card>
        <Button className="bg-rose-600 hover:bg-rose-700" onClick={resetLocal}>Reset local data</Button>
      </Card>
    </section>
  );
}
