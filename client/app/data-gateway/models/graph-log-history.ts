export type GraphLogOperationType = "query" | "mutation";
export type GraphLogResponseStatus = "success" | "failed";

/** Why a request failed — mirrors the server's GatewayFailureKind. */
export type GraphLogFailureKind =
  | "authentication"
  | "authorization"
  | "validation"
  | "bad_request"
  | "unhandled"
  | "unknown";

/** Reader-facing names for each failure reason, used by the table, filter and details panel. */
export const FAILURE_KIND_LABELS: Record<GraphLogFailureKind, string> = {
  authentication: "Authentication",
  authorization: "Authorization",
  validation: "Validation",
  bad_request: "Bad request",
  unhandled: "Server error",
  unknown: "Unknown",
};

export const failureKindLabel = (failureKind: string) =>
  FAILURE_KIND_LABELS[failureKind as GraphLogFailureKind] ?? failureKind;

export interface IGetGraphLogHistoryPayload {
  from?: string;
  to?: string;
  pageNo: number;
  pageSize: number;
  schemaName?: string;
  operationType?: GraphLogOperationType;
  responseStatus?: GraphLogResponseStatus;
  failureKind?: GraphLogFailureKind;
}

/** One GraphQL request, as recorded in the trace store. */
export interface IGraphLogHistoryItem {
  traceId: string;
  spanId: string;
  timestamp: string;
  startTime: string;
  endTime: string;
  /** Wall-clock time of the request, in milliseconds. */
  duration: number;
  operationName: string;
  status: string;
  statusDescription: string;
  schemaName: string;
  entityName: string;
  collectionName: string;
  operationType: string;
  operationQuery: string;
  mongoQuery: string;
  responseStatus: string;
  /** Why the request failed; empty on success. */
  failureKind: string;
  /** GraphQL error code behind the failure. */
  failureCode: string;
  /** Human-readable failure reason. */
  failureMessage: string;
  /** HTTP status code of the reply, 0 when the span didn't record one. */
  statusCode: number;
  /** Request body size in bytes ("request.size.bytes" on the span). */
  requestSize: number;
  /** Response body size in bytes ("response.size.bytes" on the span). */
  responseSize: number;
  /** Bytes read back from the database, from the GatewayOperation tag's own ResponseSize. */
  databaseResponseSize: number;
  inAppRequest: boolean;
}

export interface IGraphLogHistoryData {
  totalCount: number;
  items: IGraphLogHistoryItem[];
}

export interface IGraphLogHistoryResponse {
  isSuccess: boolean;
  data: IGraphLogHistoryData;
  errors: unknown | null;
}
