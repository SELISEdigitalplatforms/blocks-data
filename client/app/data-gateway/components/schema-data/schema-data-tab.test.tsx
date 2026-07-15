import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

const executeGraphQL = vi.fn();

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useExecuteGraphQL: () => ({ mutateAsync: executeGraphQL }),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantSlug: "slug1" } }),
  // http-client.ts constructs HttpClient instances at import time.
  HttpClient: class {
    get() {}
    post() {}
    put() {}
    delete() {}
  },
}));

import { SchemaDataTab } from "./schema-data-tab";

const fields = [
  { name: "name", isArray: false },
  { name: "email", isArray: false, isPIIData: true },
];

function renderTab() {
  render(
    <TooltipProvider>
      <SchemaDataTab schemaName="User" fields={fields} previewData={{}} />
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
});
