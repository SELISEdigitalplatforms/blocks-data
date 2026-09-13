import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { graphLogService } from "../services/graph-log.service";
import { IGetGraphLogHistoryPayload } from "../models/graph-log-history";

export const useGraphLogHistory = (payload: IGetGraphLogHistoryPayload) => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  return useQuery({
    queryKey: ["graph-log-history", payload, projectKey],
    queryFn: () => graphLogService.getHistory(payload),
    enabled: Boolean(payload.from && payload.to),
    // Keeps the current page on screen while the next one loads instead of flashing empty.
    placeholderData: keepPreviousData,
  });
};
