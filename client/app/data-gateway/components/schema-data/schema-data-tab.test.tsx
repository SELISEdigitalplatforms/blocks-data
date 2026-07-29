import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

const executeGraphQL = vi.fn();

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useExecuteGraphQL: () => ({ mutateAsync: executeGraphQL }),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantSlug: "slug1" } }),
  // http-client.ts constructs HttpClient instances at import time.
  HttpClient: class {
    get() {}
    post() {}
    put() {}
    delete() {}
  },
}));

vi.mock("./toolbar/filter-popover", () => ({
  FilterPopover: ({ onApply }: { onApply: (f: string) => void }) => (
    <button onClick={() => onApply('{"name":"x"}')}>apply-filter</button>
  ),
}));
vi.mock("./toolbar/projection-popover", () => ({
  ProjectionPopover: ({ onApply }: { onApply: (f: string[]) => void }) => (
    <button onClick={() => onApply(["name"])}>apply-projection</button>
  ),
}));
vi.mock("./toolbar/sort-popover", () => ({
  SortPopover: ({
    onApply,
    onClear,
  }: {
    onApply: (f: string, d: "asc" | "desc") => void;
    onClear: () => void;
  }) => (
    <>
      <button onClick={() => onApply("name", "desc")}>apply-sort</button>
      <button onClick={onClear}>clear-sort</button>
    </>
  ),
}));
vi.mock("./toolbar/reset-button", () => ({
  ResetButton: ({ onReset }: { onReset: () => void }) => (
    <button onClick={onReset}>reset-all</button>
  ),
}));
vi.mock("./toolbar/data-pagination", () => ({
  DataPagination: ({
    onPageChange,
    onPageSizeChange,
  }: {
    onPageChange: (p: number) => void;
    onPageSizeChange: (v: string) => void;
  }) => (
    <>
      <button onClick={() => onPageChange(2)}>next-page</button>
      <button onClick={() => onPageSizeChange("50")}>size-50</button>
    </>
  ),
}));

import { SchemaDataTab } from "./schema-data-tab";
import { HttpError } from "@/lib/http-client";

const fields = [
  { name: "name", isArray: false },
  { name: "email", isArray: false, isPIIData: true },
];

function renderTab(previewData: Record<string, unknown> = {}) {
  render(
    <TooltipProvider>
      <SchemaDataTab schemaName="User" fields={fields} previewData={previewData} />
    </TooltipProvider>,
  );
}

describe("SchemaDataTab", () => {
  beforeEach(() => {
    executeGraphQL.mockReset();
  });

  it("fetches on mount with a query for the schema and renders rows", async () => {
    executeGraphQL.mockResolvedValue({
      data: { getUsers: { items: [{ name: "Alice", email: "a@b.c" }], totalCount: 1 } },
    });
    renderTab();

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(executeGraphQL).toHaveBeenCalledWith(
      expect.objectContaining({
        projectShortKey: "slug1",
        query: expect.stringContaining("getUsers("),
      }),
    );
  });

  it("shows the empty state when no records come back", async () => {
    executeGraphQL.mockResolvedValue({
      data: { getUsers: { items: [], totalCount: 0 } },
    });
    renderTab();
    expect(await screen.findByText("No data found")).toBeInTheDocument();
  });

  it("shows the error state when the query fails", async () => {
    executeGraphQL.mockRejectedValue(new Error("boom"));
    renderTab();

    expect(await screen.findByText("Failed to fetch data")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("switches to the JSON view when its toggle is clicked", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({
      data: { getUsers: { items: [{ name: "Alice", email: "a@b.c" }], totalCount: 1 } },
    });
    renderTab();
    await screen.findByText("Alice");

    await user.click(screen.getByRole("button", { name: "JSON view" }));
    // JSON view labels each record with a #index
    expect(await screen.findByText("#1")).toBeInTheDocument();
  });

  it("masks PII columns in the fetched data", async () => {
    executeGraphQL.mockResolvedValue({
      data: {
        getUsers: {
          items: [{ name: "Alice", email: "secret@example.com" }],
          totalCount: 1,
        },
      },
    });
    renderTab();
    await screen.findByText("Alice");

    await waitFor(() =>
      expect(screen.queryByText("secret@example.com")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("builds a nested selection set from preview data on mount", async () => {
    executeGraphQL.mockResolvedValue({
      data: { getUsers: { items: [], totalCount: 0 } },
    });
    render(
      <TooltipProvider>
        <SchemaDataTab
          schemaName="User"
          fields={[
            { name: "name", isArray: false },
            { name: "tags", isArray: true },
            { name: "address", isArray: false },
          ]}
          previewData={{
            name: "n",
            tags: [{ label: "l", meta: { a: 1 } }],
            address: { city: "c" },
          }}
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const query = executeGraphQL.mock.calls[0][0].query as string;
    expect(query).toContain("tags {");
    expect(query).toContain("address {");
  });

  it("applies a filter and re-queries with a filter clause", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());

    await user.click(screen.getByText("apply-filter"));
    await waitFor(() => {
      const last = executeGraphQL.mock.calls.at(-1)![0].query as string;
      expect(last).toContain("filter:");
    });
  });

  it("applies a projection and re-queries", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const before = executeGraphQL.mock.calls.length;
    await user.click(screen.getByText("apply-projection"));
    await waitFor(() =>
      expect(executeGraphQL.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("applies a sort and re-queries with a sort clause", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());

    await user.click(screen.getByText("apply-sort"));
    await waitFor(() => {
      const last = executeGraphQL.mock.calls.at(-1)![0].query as string;
      expect(last).toContain("sort:");
    });
  });

  it("changes page and page size through pagination", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [{ name: "A" }], totalCount: 40 } } });
    renderTab();
    await screen.findByText("A");
    const before = executeGraphQL.mock.calls.length;

    await user.click(screen.getByText("next-page"));
    await user.click(screen.getByText("size-50"));
    await waitFor(() =>
      expect(executeGraphQL.mock.calls.length).toBeGreaterThan(before + 1),
    );
  });

  it("resets all filters through the reset button", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const before = executeGraphQL.mock.calls.length;
    await user.click(screen.getByText("reset-all"));
    await waitFor(() =>
      expect(executeGraphQL.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("refreshes the current page via the refresh button", async () => {
    const user = userEvent.setup();
    executeGraphQL.mockResolvedValue({ data: { getUsers: { items: [], totalCount: 0 } } });
    renderTab();
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const before = executeGraphQL.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() =>
      expect(executeGraphQL.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("shows a server-status message on a 404 error", async () => {
    executeGraphQL.mockRejectedValue(new HttpError(404, { errors: {} }));
    renderTab();
    expect(
      await screen.findByText("Please check the server status"),
    ).toBeInTheDocument();
  });
});
