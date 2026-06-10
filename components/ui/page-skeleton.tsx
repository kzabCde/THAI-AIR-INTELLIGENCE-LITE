import { Skeleton, SkeletonGrid, SkeletonRows } from "@/components/ui/skeleton";

export function PageSkeleton({ withMap = false }: { withMap?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <SkeletonGrid count={4} />
      {withMap ? (
        <Skeleton className="h-[460px] w-full rounded-2xl" />
      ) : (
        <Skeleton className="h-72 w-full rounded-2xl" />
      )}
      <SkeletonRows rows={8} />
    </div>
  );
}
