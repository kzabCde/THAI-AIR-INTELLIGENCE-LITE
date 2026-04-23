"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { applyTheme } from "@/components/theme-provider";
import { DEFAULT_SETTINGS, storage, type AppLanguage, type AppTheme } from "@/lib/storage";

export default function SettingsPage() {
  const [theme, setTheme] = useState<AppTheme>(DEFAULT_SETTINGS.theme);
  const [interval, setIntervalValue] = useState<AppSettings["interval"]>(DEFAULT_SETTINGS.interval);
  const [notify, setNotify] = useState(DEFAULT_SETTINGS.notify);
  const [lang, setLang] = useState<AppLanguage>(DEFAULT_SETTINGS.lang);
  const [favorites, setFavorites] = useState(DEFAULT_SETTINGS.favorites);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const parsed = storage.getSettings();
    setTheme(parsed.theme);
    setIntervalValue(parsed.interval);
    setNotify(parsed.notify);
    setLang(parsed.lang);
    setFavorites(parsed.favorites);
  }, []);

  const save = () => {
    const next = { theme, interval, notify, lang, favorites };
    storage.setSettings(next);
    applyTheme(theme);
    document.documentElement.lang = lang;
    setSavedAt(new Date().toLocaleTimeString("th-TH"));
  };

  const clearCache = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("thai_air_history_v2");
    localStorage.removeItem("thai_air_snapshot_v2");
    window.location.reload();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">ตั้งค่าระบบ</h1>
      <Card className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">โหมดธีม
          <select value={theme} onChange={(e) => setTheme(e.target.value as AppTheme)} className="mt-1 w-full rounded-lg border p-2">
            <option value="system">ตามระบบ</option><option value="light">สว่าง</option><option value="dark">มืด</option>
          </select>
        </label>
        <label className="text-sm">ช่วงรีเฟรชข้อมูล
          <select value={interval} onChange={(e) => setIntervalValue(e.target.value as AppSettings["interval"])} className="mt-1 w-full rounded-lg border p-2">
            <option value="60">ทุก 60 วินาที</option><option value="300">ทุก 5 นาที</option><option value="600">ทุก 10 นาที</option>
          </select>
        </label>
        <label className="text-sm">จังหวัดโปรด (คั่นด้วย comma)
          <input value={favorites} onChange={(e) => setFavorites(e.target.value)} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="flex items-center gap-2 text-sm">แจ้งเตือนความเสี่ยง
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        </label>
        <label className="text-sm">ภาษา
          <select value={lang} onChange={(e) => setLang(e.target.value as AppLanguage)} className="mt-1 w-full rounded-lg border p-2">
            <option value="th">ไทย</option><option value="en">English</option>
          </select>
        </label>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save}>บันทึกการตั้งค่า</Button>
        <Button className="bg-rose-600 hover:bg-rose-700" onClick={clearCache}>ล้างแคชทั้งหมด</Button>
      </div>
      {savedAt && <p className="text-sm text-emerald-600">บันทึกสำเร็จเวลา {savedAt}</p>}
    </section>
  );
}

type AppSettings = {
  theme: AppTheme;
  interval: "60" | "300" | "600";
  notify: boolean;
  lang: AppLanguage;
  favorites: string;
};
