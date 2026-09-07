export type GraphLogGranularity = "hourly" | "daily" | "weekly";

export interface IGetGraphLogAnalyticsPayload {
  from?: string;
  to?: string;
  granularity: GraphLogGranularity;
}

export interface IGraphLogRequestsOverTimeBucket {
  date: string;
  success: number;
  /** Refused on purpose — authentication, authorization or validation. */
  denied: number;
  /** Failed because something broke. */
  errored: number;
}

export interface IGraphLogOperationStat {
  schemaName: string;
  calls: number;
  success: number;
  /** Everything that did not succeed: `denied` plus `errored`. */
  failed: number;
  /** Refused on purpose — authentication, authorization or validation. */
  denied: number;
  /** Failed because something broke. */
  errored: number;
  errorRate: number;
  /** Mean response time in milliseconds. */
  averageDuration: number;
  /** 95th-percentile response time in milliseconds. */
  p95Duration: number;
  /** Mean response body size in bytes. */
  averageResponseSize: number;
  /** Largest single response body in bytes. */
  maxResponseSize: number;
  /** Bytes in and out for this field across the range. */
  totalBytes: number;
  /** Mean documents returned or affected per call. */
  averageDocumentCount: number;
  /** Most documents any single call returned or affected. */
  maxDocumentCount: number;
}

/** Bytes in and out for one time bucket. */
export interface IGraphLogThroughputBucket {
  date: string;
  requestBytes: number;
  responseBytes: number;
}

export interface IGraphLogThroughputSummary {
  requestBytes: number;
  responseBytes: number;
  totalBytes: number;
}

/** Response times in milliseconds across the whole range. */
export interface IGraphLogLatencySummary {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** Response-time percentiles for one time bucket. */
export interface IGraphLogLatencyBucket {
  date: string;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Mean milliseconds per phase of a request. The named phases plus `averageOther` add up to
 * `averageTotal` — nothing is counted twice.
 */
export interface IGraphLogTimingBreakdown {
  averageTotal: number;
  averagePolicy: number;
  averageValidation: number;
  averageDatabase: number;
  averagePublish: number;
  /** GraphQL parsing and serialization, the HTTP pipeline, and time on the wire. */
  averageOther: number;
}

/** One entity schema's traffic in the range; zeroes mean it was never called. */
export interface IGraphLogSchemaCoverage {
  entityName: string;
  calls: number;
  queries: number;
  mutations: number;
}

/** Failures for one schema/reason pair. */
export interface IGraphLogFailureHotspot {
  schemaName: string;
  failureKind: string;
  count: number;
  /** How many of `count` came from outside the app. */
  externalCount: number;
}

export interface IGraphLogFailureStat {
  failureKind: string;
  count: number;
}

export interface IGraphLogAnalyticsData {
  requestsOverTime: IGraphLogRequestsOverTimeBucket[];
  operationStats: IGraphLogOperationStat[];
  failureStats: IGraphLogFailureStat[];
  latency: IGraphLogLatencySummary;
  latencyOverTime: IGraphLogLatencyBucket[];
  throughput: IGraphLogThroughputSummary;
  throughputOverTime: IGraphLogThroughputBucket[];
  failureHotspots: IGraphLogFailureHotspot[];
  schemaCoverage: IGraphLogSchemaCoverage[];
  timing: IGraphLogTimingBreakdown;
}

export interface IGraphLogAnalyticsResponse {
  isSuccess: boolean;
  data: IGraphLogAnalyticsData;
  errors: unknown | null;
}
