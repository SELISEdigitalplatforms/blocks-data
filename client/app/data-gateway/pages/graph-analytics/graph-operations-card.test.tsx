import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IGraphLogOperationStat } from "../../models/graph-log-analytics";
import { GraphOperationsCard } from "./graph-operations-card";

const STAT: IGraphLogOperationStat = {
  schemaName: "getProducts",
  calls: 10,
  success: 6,
  failed: 4,
  denied: 3,
  errored: 1,
  errorRate: 40,
  averageDuration: 780.2,
  p95Duration: 1540.5,
  averageResponseSize: 2048,
  maxResponseSize: 8192,
  totalBytes: 26624,
  averageDocumentCount: 250,
  maxDocumentCount: 500,
  restCount: 4,
  graphQLCount: 6,
};

describe("GraphOperationsCard", () => {
  it("shows how many of each operation's calls came over REST and over GraphQL", () => {
    render(<GraphOperationsCard operationStats={[STAT]} isError={false} />);

    expect(screen.getByRole("columnheader", { name: "REST" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "GraphQL" })).toBeInTheDocument();

    const row = screen.getByRole("row", { name: /getProducts/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["getProducts", "10", "4", "6", "6", "3", "1", "780 ms", "1.54 s"]);
  });

  it("keeps the empty message spanning every column", () => {
    render(<GraphOperationsCard operationStats={[]} isError={false} />);

    expect(screen.getByRole("cell", { name: "No requests in this range." })).toHaveAttribute(
      "colspan",
      "9",
    );
  });
});
