import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Table, TableBody } from "@/components/ui-kits/table/table";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";
import type { ISchemaDetails } from "../../models/data-service";
import type { NestedTreeRow } from "../../utils/nested-tree.util";
import { NestedTreeRowView, type NestedRowActions } from "./property-tree";

const leaf: NestedTreeRow = {
  kind: "field",
  path: "Create.Roles",
  depth: 1,
  field: { name: "Roles", type: "String", isArray: true, description: "Roles allowed", totalValidationRules: 1 },
  guides: ["tee"],
  childSchema: null,
  blockedReason: null,
  isExpanded: false,
};

const object: NestedTreeRow = {
  ...leaf,
  path: "Home.Geo",
  field: { name: "Geo", type: "GeoPoint", isArray: false },
  childSchema: { schemaName: "GeoPoint", fields: [{ name: "Lat" }, { name: "Lng" }] } as ISchemaDetails,
};

function renderRow(row: NestedTreeRow, extra: { activeRule?: "validation" | "default" | null } = {}) {
  const actions: NestedRowActions = { onToggle: vi.fn(), onOpenAccess: vi.fn(), onOpenValidation: vi.fn(), onOpenDefault: vi.fn() };
  render(
    <TooltipProvider>
      <Table>
        <TableBody>
          <NestedTreeRowView row={row} columnCount={6} showRules showAccess showDefault activeRule={extra.activeRule ?? null} actions={actions} />
        </TableBody>
      </Table>
    </TooltipProvider>,
  );
  return actions;
}

describe("NestedTreeRowView", () => {
  it("shows a nested property in the table's columns and opens its rules by full path", async () => {
    const user = userEvent.setup();
    const actions = renderRow(leaf);

    expect(screen.getByText("Roles")).toBeInTheDocument();
    expect(screen.getByText("Roles allowed")).toBeInTheDocument();
    expect(screen.getByText("ARR")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View access for Create.Roles" }));
    await user.click(screen.getByRole("button", { name: "Manage validations for Create.Roles (1)" }));
    await user.click(screen.getByRole("button", { name: "Default value for Create.Roles" }));

    expect(actions.onOpenAccess).toHaveBeenCalledWith("Create.Roles", leaf.field);
    expect(actions.onOpenValidation).toHaveBeenCalledWith("Create.Roles", leaf.field);
    expect(actions.onOpenDefault).toHaveBeenCalledWith("Create.Roles", leaf.field);
  });

  it("marks the rule whose panel is open", () => {
    renderRow(leaf, { activeRule: "validation" });
    expect(screen.getByRole("button", { name: /Manage validations for Create.Roles/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens an object property and keeps its rules off, since they belong to its fields", async () => {
    const user = userEvent.setup();
    const actions = renderRow(object);

    expect(screen.getByText("2 fields")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Home.Geo" }));
    expect(actions.onToggle).toHaveBeenCalledWith("Home.Geo");
    expect(screen.getAllByRole("button", { name: "Rules apply to the fields inside Geo" })).toHaveLength(2);
  });

  it("won't open an object that contains itself", () => {
    renderRow({ ...object, blockedReason: "GeoPoint contains itself, so it isn't opened again here" });
    expect(screen.getByRole("button", { name: "Expand Home.Geo" })).toBeDisabled();
  });

  it("stands in for children that are still loading", () => {
    renderRow({ ...leaf, kind: "loading", path: "Home.(loading)" });
    expect(screen.getByText("Loading fields…")).toBeInTheDocument();
  });
});
