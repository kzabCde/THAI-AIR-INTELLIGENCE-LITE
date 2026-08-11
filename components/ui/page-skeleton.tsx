import { Skeleton } from "@/components/ui/skeleton";

export function MapPageSkeleton() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* 1. Filter Control Bar */}
      <Skeleton className="h-14 w-full rounded-2xl" />

      {/* 2. Map Container Canvas */}
      <Skeleton className="h-[520px] w-full rounded-3xl" />

      {/* 3. Bottom Situation Cards (Single Row 3 Columns) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
        <Skeleton className="h-[68px] sm:h-[76px] w-full rounded-2xl" />
        <Skeleton className="h-[68px] sm:h-[76px] w-full rounded-2xl" />
        <Skeleton className="h-[68px] sm:h-[76px] w-full rounded-2xl" />
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* 1. Hero Card */}
      <Skeleton className="h-[220px] w-full rounded-3xl" />

      {/* 2. Health Advice 4 Pills Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>

      {/* 3. AI Forecast Highlights (24h Trend + 7-Day Forecast) */}
      <div className="space-y-4">
        <Skeleton className="h-[190px] w-full rounded-3xl" />
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton({ withMap = false }: { withMap?: boolean }) {
  if (withMap) {
    return <MapPageSkeleton />;
  }
  return <OverviewSkeleton />;
}
