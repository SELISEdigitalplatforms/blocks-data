import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";

/**
 * Stand-in for `SchemaBasicInfo` while the schema loads.
 *
 * It mirrors that component's box model exactly — same `rounded-t-sm
 * border-b-0` card (it butts against the field table below it, so a full
 * border here pops a stray rule the moment real data lands), same `px-5
 * py-3.5` header, and the same two stacked title lines. The earlier version
 * drew a single title line inside an all-round border, so every schema switch
 * shifted the table underneath by a few pixels as the placeholder gave way.
 */
export const SchemaBasicInfoSkeleton = () => (
  <div className="overflow-hidden rounded-t-sm border border-b-0 border-border/40 bg-card">
    {/* Header — matches the real header's 8x8 icon plus name/meta stack */}
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-[17px] w-14 rounded" />
          </div>
          <Skeleton className="h-4 w-44 rounded" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-8 w-[88px] rounded-sm" />
        <Skeleton className="h-8 w-[124px] rounded-sm" />
        <Skeleton className="h-8 w-8 rounded-sm" />
      </div>
    </div>

    {/* Access row — same border, padding and pill geometry as the real strip */}
    <div className="flex items-center gap-4 border-t border-border/40 px-5 py-3">
      <Skeleton className="h-[13px] w-[86px] rounded" />
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[26px] w-[104px] rounded-md" />
        ))}
      </div>
    </div>
  </div>
);
