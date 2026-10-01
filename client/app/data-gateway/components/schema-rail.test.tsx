import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSchemaList = vi.fn();

vi.mock("../hooks/use-configuration", () => ({
  useSchemaList: (...a: unknown[]) => useSchemaList(...a),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

import { SchemaRail } from "./schema-rail";

function renderRail(props: Partial<Parameters<typeof SchemaRail>[0]> = {}) {
  const onSelectSchema = vi.fn();
  const onExpand = vi.fn();
  render(
    <SchemaRail
      filterType="all"
      page={1}
      pageSize={10}
      onSelectSchema={onSelectSchema}
      onExpand={onExpand}
      {...props}
    />,
  );
  return { onSelectSchema, onExpand };
}

describe("SchemaRail", () => {
  beforeEach(() => {
    useSchemaList.mockReset();
    useSchemaList.mockReturnValue({
      data: {
        data: {
          items: [
            { id: "a", schemaName: "Order" },
            { id: "b", schemaName: "Customer" },
          ],
        },
      },
    });
  });

  it("shows one initial per schema", () => {
    renderRail();
    expect(screen.getByRole("button", { name: "Order" })).toHaveTextContent("O");
    expect(screen.getByRole("button", { name: "Customer" })).toHaveTextContent("C");
  });

  it("marks the selected schema current", () => {
    renderRail({ selectedSchemaId: "a" });
    expect(screen.getByRole("button", { name: "Order" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Customer" })).not.toHaveAttribute("aria-current");
  });

  it("selects a schema when its initial is clicked", async () => {
    const user = userEvent.setup();
    const { onSelectSchema } = renderRail();

    await user.click(screen.getByRole("button", { name: "Customer" }));
    expect(onSelectSchema).toHaveBeenCalledWith("b");
  });

  it("expands back to the full list", async () => {
    const user = userEvent.setup();
    const { onExpand } = renderRail();

    await user.click(screen.getByRole("button", { name: "Show the schema list" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("renders no schema chips before the query resolves", () => {
    useSchemaList.mockReturnValue({ data: undefined });
    renderRail();
    expect(screen.queryByRole("button", { name: "Order" })).not.toBeInTheDocument();
  });
});
