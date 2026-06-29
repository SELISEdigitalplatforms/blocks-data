import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";

export const SchemaBasicInfoSkeleton = () => (
  <div className="rounded-sm border border-border/60 bg-card">
    {/* Header */}
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>

    {/* Access row */}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/50 px-5 py-3">
      <Skeleton className="h-3 w-12 rounded" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-8 rounded" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);
