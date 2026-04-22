import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <section className="space-y-8 py-8 md:py-16">
      <div className="space-y-4 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-600">Thesis Demo</p>
        <h1 className="text-4xl font-extrabold md:text-6xl">Thailand Air Intelligence</h1>
        <p className="mx-auto max-w-2xl text-slate-600 dark:text-slate-300">
          Simple real-time PM2.5 dashboard for every province in Thailand.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/dashboard"><Button>Open Dashboard</Button></Link>
          <Link href="/map"><Button className="bg-slate-700 hover:bg-slate-800">View Map</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          "Live PM2.5 from free APIs",
          "Province comparison and trends",
          "Forecast estimates and health guidance",
        ].map((item) => (
          <Card key={item} className="text-center text-sm text-slate-600 dark:text-slate-300">{item}</Card>
        ))}
      </div>
    </section>
  );
}
