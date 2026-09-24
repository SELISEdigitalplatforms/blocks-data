import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SecurityAndPerformanceTable from "./security-and-performance-table";

type Schema = Parameters<typeof SecurityAndPerformanceTable>[0]["schemas"][number];

function makeSchema(overrides: Partial<Schema> = {}): Schema {
  return {
    schemaName: "User",
    readAccessLevel: 0,
    writeAccessLevel: 1,
    editAccessLevel: 2,
    deleteAccessLevel: 3,
    ...overrides,
  } as Schema;
}

describe("SecurityAndPerformanceTable", () => {
  it("renders the empty state when there are no schemas", () => {
    render(<SecurityAndPerformanceTable schemas={[]} onRowClick={vi.fn()} />);
    expect(screen.getByText("No schemas to display")).toBeInTheDocument();
  });

  // The four levels are one cell each now, lettered V C E D — View/Create/
  // Edit/Delete, the same vocabulary and order the schema page's own access
  // pills use, not the Create/Read/Update/Delete this table used to spell
  // out. The tier lives in the colour and the tooltip, so the letters stay
  // lined up.
  it("renders a cell per verb, titled with its tier", () => {
    render(
      <SecurityAndPerformanceTable
        schemas={[makeSchema({ schemaName: "Orders", collectionName: "orders" })]}
        onRowClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();

    // makeSchema: read 0, write 1, edit 2, delete 3.
    expect(screen.getByTitle("View — Inherited")).toHaveTextContent("V");
    expect(screen.getByTitle("Create — Logged-in users")).toHaveTextContent("C");
    expect(screen.getByTitle("Edit — Public")).toHaveTextContent("E");
    expect(screen.getByTitle("Delete — Custom")).toHaveTextContent("D");
  });

  // Create maps to writeAccessLevel and Edit to editAccessLevel; the two are
  // adjacent and easy to wire backwards.
  it("maps Create to write and Edit to edit, not the other way round", () => {
    render(
      <SecurityAndPerformanceTable
        schemas={[
          makeSchema({ writeAccessLevel: 2, editAccessLevel: 0, readAccessLevel: 3 }),
        ]}
        onRowClick={vi.fn()}
      />,
    );

    expect(screen.getByTitle("Create — Public")).toBeInTheDocument();
    expect(screen.getByTitle("Edit — Inherited")).toBeInTheDocument();
  });

  it("names the exposure and counts PII fields", () => {
    render(
      <SecurityAndPerformanceTable
        schemas={[
          makeSchema({
            readAccessLevel: 2,
            writeAccessLevel: 3,
            editAccessLevel: 3,
            deleteAccessLevel: 3,
            fields: [{ name: "Email", isPIIData: true }, { name: "Total" }] as never,
          }),
        ]}
        onRowClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Public read")).toBeInTheDocument();
    expect(screen.getByText("1 field")).toBeInTheDocument();
  });

  it("says None when a schema holds no PII", () => {
    render(
      <SecurityAndPerformanceTable schemas={[makeSchema()]} onRowClick={vi.fn()} />,
    );
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("renders a dash for an unknown access level", () => {
    render(
      <SecurityAndPerformanceTable
        schemas={[
          makeSchema({
            readAccessLevel: 9,
            writeAccessLevel: 9,
            editAccessLevel: 9,
            deleteAccessLevel: 9,
          }),
        ]}
        onRowClick={vi.fn()}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("invokes onRowClick with the schema when a row is clicked", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const schema = makeSchema({ schemaName: "Products" });
    render(<SecurityAndPerformanceTable schemas={[schema]} onRowClick={onRowClick} />);

    await user.click(screen.getByText("Products"));
    expect(onRowClick).toHaveBeenCalledWith(schema);
  });
});
