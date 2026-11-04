import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IGraphLogHistoryItem } from "../../models/graph-log-history";
import { GraphLogDetailsSheet } from "./graph-log-details-sheet";

const ITEM: IGraphLogHistoryItem = {
  traceId: "740beaf14c3d3b81aef579129094f667",
  spanId: "d8793a20abbf427c",
  timestamp: "2026-08-30T19:09:57.099Z",
  startTime: "2026-08-30T19:09:55.608Z",
  endTime: "2026-08-30T19:09:57.099Z",
  duration: 120,
  operationName: "GET /api/gateway/Product",
  statusDescription: "",
  schemaName: "getProducts",
  entityName: "Product",
  collectionName: "Products",
  operationType: "query",
  transport: "graphql",
  operationQuery: "query { getProducts { items { ItemId } } }",
  mongoQuery: "",
  responseStatus: "success",
  failureKind: "",
  failureCode: "",
  failureMessage: "",
  statusCode: 200,
  requestSize: 10,
  responseSize: 20,
  databaseResponseSize: 0,
  documentCount: 1,
  inAppRequest: true,
  isIntrospection: false,
  userAgent: "",
  policyMs: 0,
  validationMs: 0,
  databaseMs: 0,
  publishMs: 0,
};

const renderSheet = (item: IGraphLogHistoryItem) =>
  render(<GraphLogDetailsSheet item={item} open onOpenChange={vi.fn()} />);

describe("GraphLogDetailsSheet", () => {
  it("labels a REST row's request text 'Request'", async () => {
    renderSheet({ ...ITEM, transport: "rest", operationQuery: "GET /api/gateway/Product" });

    const details = await screen.findByRole("dialog");
    expect(within(details).getByText("GET /api/gateway/Product", { selector: "pre" })).toBeInTheDocument();
    expect(within(details).getByText("Request")).toBeInTheDocument();
    expect(within(details).queryByText("GraphQL query")).not.toBeInTheDocument();
  });

  it("keeps 'GraphQL query' for a GraphQL row", async () => {
    renderSheet(ITEM);

    const details = await screen.findByRole("dialog");
    expect(within(details).getByText("GraphQL query")).toBeInTheDocument();
    expect(within(details).queryByText("Request")).not.toBeInTheDocument();
  });
});
