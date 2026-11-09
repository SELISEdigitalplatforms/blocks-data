import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";
export type GraphLogOperationType = "query" | "mutation";
/** How a request reached the gateway; a log entry with no recorded transport is GraphQL. */
export type GraphLogTransport = "rest" | "graphql";
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
  get authentication() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "GRAPH_LOG_HISTORY.AUTHENTICATION"); },
  get authorization() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "GRAPH_LOG_HISTORY.AUTHORIZATION"); },
  get validation() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "GRAPH_LOG_HISTORY.VALIDATION"); },
  get syntax_error() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "GRAPH_LOG_HISTORY.SYNTAX_ERROR"); },
  get bad_request() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "GRAPH_LOG_HISTORY.BAD_REQUEST"); },
  get unhandled() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "GRAPH_LOG_HISTORY.SERVER_ERROR"); },
  get unknown() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "GRAPH_LOG_HISTORY.OTHERS"); },
};

export const failureKindLabel = (failureKind: string) =>
  FAILURE_KIND_LABELS[failureKind as GraphLogFailureKind] ?? failureKind;

export const DENIED_FAILURE_KINDS = new Set<string>([
  "authentication",
  "authorization",
  "validation",
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
  /** Viewer offset from UTC in minutes; UTC+06:00 is 360. */
  utcOffsetMinutes: number;
  pageNo: number;
  pageSize: number;
  schemaName?: string;
  operationType?: GraphLogOperationType;
  transport?: GraphLogTransport;
  outcome?: GraphLogOutcome;
  statusCode?: number;
  failureKind?: GraphLogFailureKind;
  includeBlocksConsole: boolean;
  sortBy: GraphLogHistorySort;
  sortDescending: boolean;
}

/** One gateway request (REST or GraphQL), as recorded in the trace store. */
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
  /** "rest" or "graphql". */
  transport: GraphLogTransport;
  /** The request text: the GraphQL query for GraphQL rows, the REST request line for REST rows. */
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
