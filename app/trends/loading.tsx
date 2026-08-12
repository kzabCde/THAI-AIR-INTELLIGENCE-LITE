import { Skeleton, SkeletonGrid } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-72 max-w-full" /></div>
        <Skeleton className="hidden h-8 w-40 sm:block" />
      </div>
      <div className="rounded-2xl border border-border bg-surface p-2.5"><Skeleton className="h-9 w-full rounded-full" /></div>
      <Skeleton className="h-44 rounded-3xl" />
      <SkeletonGrid />
      <Skeleton className="h-96 rounded-3xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
    </div>
  );
}
