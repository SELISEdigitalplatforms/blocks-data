export type GraphLogGranularity = "daily" | "weekly";

export interface IGetGraphLogAnalyticsPayload {
  from?: string;
  to?: string;
  granularity: GraphLogGranularity;
}

export interface IGraphLogRequestsOverTimeBucket {
  date: string;
  success: number;
  failed: number;
}

export interface IGraphLogOperationStat {
  schemaName: string;
  calls: number;
  success: number;
  failed: number;
  errorRate: number;
}

export interface IGraphLogAnalyticsData {
  requestsOverTime: IGraphLogRequestsOverTimeBucket[];
  operationStats: IGraphLogOperationStat[];
}

export interface IGraphLogAnalyticsResponse {
  isSuccess: boolean;
  data: IGraphLogAnalyticsData;
  errors: unknown | null;
}
