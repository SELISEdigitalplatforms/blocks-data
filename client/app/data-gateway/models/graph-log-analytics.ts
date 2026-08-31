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

export interface IGraphLogFailureStat {
  failureKind: string;
  count: number;
}

export interface IGraphLogAnalyticsData {
  requestsOverTime: IGraphLogRequestsOverTimeBucket[];
  operationStats: IGraphLogOperationStat[];
  failureStats: IGraphLogFailureStat[];
}

export interface IGraphLogAnalyticsResponse {
  isSuccess: boolean;
  data: IGraphLogAnalyticsData;
  errors: unknown | null;
}
