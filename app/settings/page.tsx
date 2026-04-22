"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const resetLocal = () => {
    localStorage.removeItem("thai_air_history_v2");
    localStorage.removeItem("thai_air_snapshot_v2");
    window.location.reload();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card className="space-y-2">
        <h2 className="font-semibold">Auto-refresh policy</h2>
        <p className="text-sm">Current data refreshes every 30 minutes. Weather refreshes every 60 minutes. Historical cache rolls over 90 days.</p>
      </Card>
      <Card>
        <Button className="bg-rose-600 hover:bg-rose-700" onClick={resetLocal}>Reset local history cache</Button>
      </Card>
    </section>
  );
}
