import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";

export const FolderGridSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    {Array.from({ length: 4 }).map((_, index) => (
      <div
        key={index}
        className="flex items-center justify-between gap-2 rounded-lg border bg-background p-4"
      >
        <div className="flex flex-1 items-center gap-3">
          <Skeleton className="h-5 w-5 flex-shrink-0 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-8 w-8 flex-shrink-0 rounded" />
      </div>
    ))}
  </div>
);

export const FolderListSkeleton = () => (
  <div className="rounded-lg border bg-background">
    <div className="grid grid-cols-[2fr,1fr,1fr,1fr,auto] gap-4 border-b bg-muted/50 px-4 py-3 text-sm font-medium text-muted-foreground">
      <div>Name</div>
      <div>File type</div>
      <div>Size</div>
      <div>Last modified</div>
      <div className="w-8"></div>
    </div>
    {Array.from({ length: 3 }).map((_, index) => (
      <div
        key={index}
        className="grid grid-cols-[2fr,1fr,1fr,1fr,auto] gap-4 border-b px-4 py-3 last:border-b-0"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 flex-shrink-0 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-8 w-8" />
      </div>
    ))}
  </div>
);

export const FileGridSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    {Array.from({ length: 8 }).map((_, index) => (
      <div key={index} className="flex flex-col rounded-lg border bg-background">
        {/* File Preview Skeleton */}
        <div className="flex h-40 items-center justify-center border-b bg-muted/30 p-4">
          <Skeleton className="h-12 w-12 rounded" />
        </div>
        {/* File Info Skeleton */}
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="flex flex-1 items-center gap-2">
            <Skeleton className="h-5 w-5 flex-shrink-0 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const FileListSkeleton = () => (
  <div className="rounded-lg border bg-background">
    <div className="grid grid-cols-[2fr,1fr,1fr,1fr,auto] gap-4 border-b bg-muted/50 px-4 py-3 text-sm font-medium text-muted-foreground">
      <div>Name</div>
      <div>File type</div>
      <div>Size</div>
      <div>Last modified</div>
      <div className="w-8"></div>
    </div>
    {Array.from({ length: 5 }).map((_, index) => (
      <div
        key={index}
        className="grid grid-cols-[2fr,1fr,1fr,1fr,auto] gap-4 border-b px-4 py-3 last:border-b-0"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 flex-shrink-0 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-8 w-8" />
      </div>
    ))}
  </div>
);
