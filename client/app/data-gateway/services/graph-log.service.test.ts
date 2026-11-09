import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { GRAPH_LOG_ENDPOINTS } from "../constants/endpoint.constant";
import { graphLogService } from "./graph-log.service";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("GraphLogService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes outcome, status-code, and sorting controls to request history", async () => {
    vi.mocked(http.get).mockResolvedValue({ isSuccess: true, data: { items: [] } });

    await graphLogService.getHistory({
      from: "2026-09-01",
      to: "2026-09-08",
      utcOffsetMinutes: 360,
      pageNo: 2,
      pageSize: 25,
      operationType: "query",
      outcome: "denied",
      statusCode: 401,
      failureKind: "authentication",
      includeBlocksConsole: true,
      sortBy: "schema",
      sortDescending: false,
    });

    expect(http.get).toHaveBeenCalledWith(
      `${GRAPH_LOG_ENDPOINTS.HISTORY}?PageNo=2&PageSize=25&From=2026-09-01&To=2026-09-08&UtcOffsetMinutes=360&OperationType=query&Outcome=denied&StatusCode=401&FailureKind=authentication&IncludeBlocksConsole=true&SortBy=schema&SortDescending=false`,
    );
  });

  it("passes the viewer offset to analytics bucketing", async () => {
    vi.mocked(http.get).mockResolvedValue({ isSuccess: true, data: {} });

    await graphLogService.getAnalytics({
      from: "2026-09-02",
      to: "2026-09-09",
      utcOffsetMinutes: 360,
      granularity: "daily",
      includeBlocksConsole: true,
    });

    expect(http.get).toHaveBeenCalledWith(
      `${GRAPH_LOG_ENDPOINTS.ANALYTICS}?From=2026-09-02&To=2026-09-09&UtcOffsetMinutes=360&Granularity=daily&IncludeBlocksConsole=true`,
    );
  });

  it("sends the transport filter to history and analytics when one is chosen", async () => {
    vi.mocked(http.get).mockResolvedValue({ isSuccess: true, data: {} });

    await graphLogService.getHistory({
      from: "2026-09-01",
      to: "2026-09-08",
      utcOffsetMinutes: 360,
      pageNo: 1,
      pageSize: 10,
      transport: "rest",
      includeBlocksConsole: false,
      sortBy: "time",
      sortDescending: true,
    });
    await graphLogService.getAnalytics({
      from: "2026-09-02",
      to: "2026-09-09",
      utcOffsetMinutes: 360,
      granularity: "daily",
      transport: "graphql",
      includeBlocksConsole: false,
    });

    expect(http.get).toHaveBeenNthCalledWith(
      1,
      `${GRAPH_LOG_ENDPOINTS.HISTORY}?PageNo=1&PageSize=10&From=2026-09-01&To=2026-09-08&UtcOffsetMinutes=360&Transport=rest&IncludeBlocksConsole=false&SortBy=time&SortDescending=true`,
    );
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      `${GRAPH_LOG_ENDPOINTS.ANALYTICS}?From=2026-09-02&To=2026-09-09&UtcOffsetMinutes=360&Granularity=daily&Transport=graphql&IncludeBlocksConsole=false`,
    );
  });
});
