import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";
import { DataTableView } from "./data-table-view";

function renderTable(props: Parameters<typeof DataTableView>[0]) {
  return render(
    <TooltipProvider>
      <DataTableView {...props} />
    </TooltipProvider>,
  );
}

describe("DataTableView", () => {
  it("orders columns as ItemId, custom fields, then readonly fields", () => {
    renderTable({
      data: [{ CreatedDate: "2024", name: "Alice", ItemId: "1" }],
    });
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim());
    // First header is the row-number "#"
    expect(headers[0]).toBe("#");
    expect(headers.slice(1)).toEqual(["ItemId", "name", "CreatedDate"]);
  });

  it("renders scalar values and an em dash for nullish cells", () => {
    renderTable({ data: [{ name: "Bob", note: null }] });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("serializes object cell values to JSON", () => {
    renderTable({ data: [{ meta: { a: 1 } }] });
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });

  it("masks PII columns and never shows the real value", () => {
    renderTable({
      data: [{ ssn: "123-45-6789" }],
      piiFields: new Set(["ssn"]),
    });
    expect(screen.queryByText("123-45-6789")).not.toBeInTheDocument();
    const body = screen.getAllByRole("row").at(-1)!;
    expect(within(body).getByText("••••••••")).toBeInTheDocument();
  });
});
