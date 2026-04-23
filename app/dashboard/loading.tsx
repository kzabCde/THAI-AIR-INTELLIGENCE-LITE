export default function DashboardLoading() {
  return (
    <section className="space-y-4">
      <div className="h-9 w-1/2 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-[360px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
    </section>
  );
}
