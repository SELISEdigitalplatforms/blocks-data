import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";

const LoadingSkeleton = () => (
  <div className="flex flex-col gap-0">
    {/* Header bar */}
    <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-36 rounded" />
          <Skeleton className="h-3 w-52 rounded" />
        </div>
      </div>
      <Skeleton className="h-8 w-24 rounded-md" />
    </div>

    {/* Stats row */}
    <div className="grid grid-cols-3 divide-x divide-border/50 border-b border-border/50">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-8 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        </div>
      ))}
    </div>

    {/* Table header */}
    <div className="flex gap-4 border-b border-border/50 bg-muted/30 px-5 py-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full rounded" />
      ))}
    </div>

    {/* Table rows */}
    <div className="divide-y divide-border/30">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3">
          <Skeleton className="h-4 w-28 rounded" />
          {Array.from({ length: 4 }).map((_, j) => (
            <Skeleton key={j} className="h-5 w-24 rounded-full" />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export default LoadingSkeleton;
