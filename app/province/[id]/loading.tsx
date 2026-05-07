export default function ProvinceLoading() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl border bg-white/60 dark:bg-slate-900/60" />
      ))}
    </div>
  );
}
