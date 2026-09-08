export type GraphLogOperationType = "query" | "mutation";
export type GraphLogResponseStatus = "success" | "failed";
export type GraphLogOutcome = "allowed" | "denied" | "error";
export type GraphLogHistorySort =
  "time" | "schema" | "type" | "status" | "code" | "duration" | "size" | "source";

/** Why a request failed — mirrors the server's GatewayFailureKind. */
export type GraphLogFailureKind =
  | "authentication"
  | "authorization"
  | "validation"
  | "syntax_error"
  | "bad_request"
  | "unhandled"
  | "unknown";

/** Reader-facing names for each failure reason, used by the table, filter and details panel. */
export const FAILURE_KIND_LABELS: Record<GraphLogFailureKind, string> = {
  authentication: "Authentication",
  authorization: "Authorization",
  validation: "Validation",
  syntax_error: "Syntax error",
  bad_request: "Bad request",
  unhandled: "Server error",
  unknown: "Others",
};

export const failureKindLabel = (failureKind: string) =>
  FAILURE_KIND_LABELS[failureKind as GraphLogFailureKind] ?? failureKind;

export const DENIED_FAILURE_KINDS = new Set<string>([
  "authentication",
  "authorization",
  "validation",
  "bad_request",
]);

export const graphLogOutcome = (
  item: Pick<IGraphLogHistoryItem, "responseStatus" | "failureKind">,
): GraphLogOutcome => {
  if (item.responseStatus !== "failed") return "allowed";
  return DENIED_FAILURE_KINDS.has(item.failureKind) ? "denied" : "error";
};

export interface IGetGraphLogHistoryPayload {
  from?: string;
  to?: string;
  pageNo: number;
  pageSize: number;
  schemaName?: string;
  operationType?: GraphLogOperationType;
  outcome?: GraphLogOutcome;
  statusCode?: number;
  failureKind?: GraphLogFailureKind;
  sortBy: GraphLogHistorySort;
  sortDescending: boolean;
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
  /** Documents returned (query) or affected (mutation). */
  documentCount: number;
  /** HTTP status code of the reply, 0 when the span didn't record one. */
  statusCode: number;
  /** Request body size in bytes ("request.size.bytes" on the span). */
  requestSize: number;
  /** Response body size in bytes ("response.size.bytes" on the span). */
  responseSize: number;
  /** Bytes read back from the database, from the GatewayOperation tag's own ResponseSize. */
  databaseResponseSize: number;
  inAppRequest: boolean;
  /** Schema introspection rather than data access; kept in the log, excluded from analytics. */
  isIntrospection: boolean;
  /** Raw User-Agent of the client that made the request. */
  userAgent: string;
  /** Milliseconds spent evaluating access policies. */
  policyMs: number;
  /** Milliseconds spent validating input. */
  validationMs: number;
  /** Milliseconds spent in MongoDB. */
  databaseMs: number;
  /** Milliseconds spent publishing data-change events. */
  publishMs: number;
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
