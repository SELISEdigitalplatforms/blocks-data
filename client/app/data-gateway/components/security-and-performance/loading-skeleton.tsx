import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";

const LoadingSkeleton = () => {
  return (
    <div className="space-y-6 overflow-y-auto">
      <Skeleton className="h-6 w-1/3 rounded-md" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
      <div className="space-y-3">
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </div>
        {Array.from({ length: 9 }).map((_, index) => (
          <div className="flex gap-4" key={index}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-4">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-32 rounded-md" />
      </div>
    </div>
  );
};

export default LoadingSkeleton;
