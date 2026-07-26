import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import QueryProvider, { getQueryClient } from "./query-provider";

function Consumer() {
  const { data } = useQuery({
    queryKey: ["ping"],
    queryFn: () => Promise.resolve("pong"),
  });
  return <div>data:{data ?? "loading"}</div>;
}

describe("QueryProvider", () => {
  it("provides a query client to its children", async () => {
    render(
      <QueryProvider>
        <Consumer />
      </QueryProvider>,
    );
    expect(await screen.findByText("data:pong")).toBeInTheDocument();
  });

  it("getQueryClient returns a stable singleton", () => {
    expect(getQueryClient()).toBe(getQueryClient());
  });
});
