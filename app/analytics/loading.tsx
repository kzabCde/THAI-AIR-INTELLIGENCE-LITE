export default function AnalyticsLoading() {
  return (
    <section className="space-y-4">
      <div className="h-9 w-1/2 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
        ))}
      </div>
    </section>
  );
}
