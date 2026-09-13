import { useQuery } from "@tanstack/react-query";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { graphLogService } from "../services/graph-log.service";
import { GraphLogGranularity } from "../models/graph-log-analytics";

export const useGraphLogAnalytics = (
  from: string | undefined,
  to: string | undefined,
  granularity: GraphLogGranularity,
  utcOffsetMinutes: number,
  includeBlocksConsole: boolean,
  enabled = true,
) => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  return useQuery({
    queryKey: [
      "graph-log-analytics",
      from,
      to,
      granularity,
      utcOffsetMinutes,
      includeBlocksConsole,
      projectKey,
    ],
    queryFn: () =>
      graphLogService.getAnalytics({
        from,
        to,
        granularity,
        utcOffsetMinutes,
        includeBlocksConsole,
      }),
    enabled: Boolean(from && to && enabled),
  });
};
