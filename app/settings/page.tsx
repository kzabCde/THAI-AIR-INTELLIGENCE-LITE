"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  const [theme, setTheme] = useState("system");
  const [interval, setIntervalValue] = useState("60");
  const [notify, setNotify] = useState(true);
  const [lang, setLang] = useState("th");
  const [favorites, setFavorites] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("thai_air_settings_v1");
    if (!stored) return;
    const parsed = JSON.parse(stored) as { theme: string; interval: string; notify: boolean; lang: string; favorites: string };
    setTheme(parsed.theme);
    setIntervalValue(parsed.interval);
    setNotify(parsed.notify);
    setLang(parsed.lang);
    setFavorites(parsed.favorites);
  }, []);

  const save = () => {
    localStorage.setItem("thai_air_settings_v1", JSON.stringify({ theme, interval, notify, lang, favorites }));
  };

  const clearCache = () => {
    localStorage.removeItem("thai_air_history_v2");
    localStorage.removeItem("thai_air_snapshot_v2");
    window.location.reload();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">ตั้งค่าระบบ</h1>
      <Card className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">โหมดธีม
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className="mt-1 w-full rounded-lg border p-2">
            <option value="system">ตามระบบ</option><option value="light">สว่าง</option><option value="dark">มืด</option>
          </select>
        </label>
        <label className="text-sm">ช่วงรีเฟรชข้อมูล
          <select value={interval} onChange={(e) => setIntervalValue(e.target.value)} className="mt-1 w-full rounded-lg border p-2">
            <option value="60">ทุก 60 วินาที</option><option value="300">ทุก 5 นาที</option><option value="600">ทุก 10 นาที</option>
          </select>
        </label>
        <label className="text-sm">จังหวัดโปรด (คั่นด้วย comma)
          <input value={favorites} onChange={(e) => setFavorites(e.target.value)} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="flex items-center gap-2 text-sm">แจ้งเตือนความเสี่ยง
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        </label>
        <label className="text-sm">ภาษา (เตรียมรองรับ)
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="mt-1 w-full rounded-lg border p-2">
            <option value="th">ไทย</option><option value="en">English</option>
          </select>
        </label>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save}>บันทึกการตั้งค่า</Button>
        <Button className="bg-rose-600 hover:bg-rose-700" onClick={clearCache}>ล้างแคชทั้งหมด</Button>
      </div>
    </section>
  );
}
