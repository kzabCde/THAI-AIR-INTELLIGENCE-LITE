export default function RootLoading() {
  return (
    <section className="space-y-4">
      <div className="h-10 w-2/3 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
        ))}
      </div>
    </section>
  );
}
