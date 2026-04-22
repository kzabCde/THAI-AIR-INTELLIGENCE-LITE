import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="space-y-8 py-10">
      <div className="space-y-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Thesis-Grade Demo</p>
        <h1 className="text-4xl font-extrabold md:text-6xl">Thailand Air Quality Intelligence</h1>
        <p className="mx-auto max-w-3xl text-slate-600 dark:text-slate-300">
          Frontend-only air quality intelligence app for all 77 provinces in Thailand with free/public APIs, local 90-day storage, PM2.5 prediction, and risk alerts.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/dashboard"><Button>National Dashboard</Button></Link>
          <Link href="/compare"><Button className="bg-slate-700 hover:bg-slate-800">Compare Provinces</Button></Link>
          <Link href="/analytics"><Button className="bg-emerald-700 hover:bg-emerald-800">Thesis Analytics</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>✅ 77 provinces with metadata and risk level calculation.</Card>
        <Card>✅ Multi-source API connectors with fallback ranking.</Card>
        <Card>✅ Browser-side prediction engine (MA/LR/Weighted).</Card>
      </div>
    </section>
  );
}
