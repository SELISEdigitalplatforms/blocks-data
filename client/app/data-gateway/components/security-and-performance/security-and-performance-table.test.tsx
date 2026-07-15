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

  it("renders a row per schema with the mapped access badges", () => {
    render(
      <SecurityAndPerformanceTable
        schemas={[makeSchema({ schemaName: "Orders" })]}
        onRowClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Orders")).toBeInTheDocument();
    // Levels 0..3 map to distinct badge labels
    expect(screen.getByText("Inherited")).toBeInTheDocument();
    expect(screen.getByText("Logged-in users")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
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
