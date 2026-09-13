import { http } from "@/lib/http-client";
import { GRAPH_LOG_ENDPOINTS } from "../constants/endpoint.constant";
import {
  IGetGraphLogAnalyticsPayload,
  IGraphLogAnalyticsResponse,
} from "../models/graph-log-analytics";
import { IGetGraphLogHistoryPayload, IGraphLogHistoryResponse } from "../models/graph-log-history";

class GraphLogService {
  getAnalytics(payload: IGetGraphLogAnalyticsPayload): Promise<IGraphLogAnalyticsResponse> {
    const params = new URLSearchParams();
    if (payload.from) params.set("From", payload.from);
    if (payload.to) params.set("To", payload.to);
    params.set("UtcOffsetMinutes", String(payload.utcOffsetMinutes));
    params.set("Granularity", payload.granularity);

    return http.get(`${GRAPH_LOG_ENDPOINTS.ANALYTICS}?${params.toString()}`);
  }

  getHistory(payload: IGetGraphLogHistoryPayload): Promise<IGraphLogHistoryResponse> {
    const params = new URLSearchParams();
    params.set("PageNo", String(payload.pageNo));
    params.set("PageSize", String(payload.pageSize));
    if (payload.from) params.set("From", payload.from);
    if (payload.to) params.set("To", payload.to);
    params.set("UtcOffsetMinutes", String(payload.utcOffsetMinutes));
    if (payload.schemaName) params.set("SchemaName", payload.schemaName);
    if (payload.operationType) params.set("OperationType", payload.operationType);
    if (payload.outcome) params.set("Outcome", payload.outcome);
    if (payload.statusCode) params.set("StatusCode", String(payload.statusCode));
    if (payload.failureKind) params.set("FailureKind", payload.failureKind);
    params.set("SortBy", payload.sortBy);
    params.set("SortDescending", String(payload.sortDescending));

    return http.get(`${GRAPH_LOG_ENDPOINTS.HISTORY}?${params.toString()}`);
  }
}

export const graphLogService = new GraphLogService();
