export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-72 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}
