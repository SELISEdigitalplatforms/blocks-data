import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SchemaStructureHeader } from "./schema-structure-header";

type Props = Parameters<typeof SchemaStructureHeader>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    isEditMode: false,
    hasSelectedRows: false,
    selectedFieldEntriesLength: 0,
    fieldsLength: 0,
    schemaType: 1,
    activeTab: "attribute",
    onTabChange: vi.fn(),
    onEditToggle: vi.fn(),
    onBulkDuplicate: vi.fn(),
    onBulkDelete: vi.fn(),
    onSelectAll: vi.fn(),
    setIsPreviewDrawerOpen: vi.fn(),
    ...overrides,
  };
}

describe("SchemaStructureHeader", () => {
  it("renders both tabs for a non-aggregation schema", () => {
    render(<SchemaStructureHeader {...baseProps({ schemaType: 1 })} />);
    expect(screen.getAllByRole("tab", { name: "Attribute" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("tab", { name: "Data" }).length).toBeGreaterThan(0);
  });

  it("hides the Data tab for aggregation schemas (schemaType 2)", () => {
    render(<SchemaStructureHeader {...baseProps({ schemaType: 2 })} />);
    expect(screen.queryByRole("tab", { name: "Data" })).not.toBeInTheDocument();
  });

  it("calls onEditToggle when the Edit button is clicked in view mode", async () => {
    const user = userEvent.setup();
    const onEditToggle = vi.fn();
    render(<SchemaStructureHeader {...baseProps({ onEditToggle })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEditToggle).toHaveBeenCalledTimes(1);
  });

  // The desktop trigger moved to sit beside Schema Access, in SchemaBasicInfo
  // — a sibling component — so it's no longer this component's job to render
  // it. The mobile "…" menu still opens the same drawer from in here, via
  // the lifted isPreviewDrawerOpen state its host now owns.
  it("no longer renders its own desktop Preview trigger", () => {
    render(<SchemaStructureHeader {...baseProps()} />);
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("opens the preview drawer from the mobile '…' menu", async () => {
    const user = userEvent.setup();
    const setIsPreviewDrawerOpen = vi.fn();
    render(<SchemaStructureHeader {...baseProps({ setIsPreviewDrawerOpen })} />);

    // The kebab trigger is icon-only with no accessible name; it's the only
    // dropdown trigger on screen outside edit mode.
    const kebab = document.querySelector("svg.lucide-ellipsis-vertical")!.closest("button")!;
    await user.click(kebab);
    await user.click(screen.getByRole("menuitem", { name: "Preview" }));
    expect(setIsPreviewDrawerOpen).toHaveBeenCalledWith(true);
  });

  // Save was here, disabled unless the form was valid and dirty — which is
  // exactly when the dirty bar appears. It owns Save now, so the header keeps
  // only the way out.
  it("offers Cancel but no Save in edit mode", () => {
    render(<SchemaStructureHeader {...baseProps({ isEditMode: true })} />);

    expect(screen.getAllByRole("button", { name: "Cancel" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
  // Selecting rows gave no feedback beyond the checkboxes themselves; the
  // design puts a "N selected" count beside the bulk-action control.
  it("shows how many rows are selected, and nothing when none are", () => {
    const { rerender } = render(
      <SchemaStructureHeader
        {...baseProps({ isEditMode: true, hasSelectedRows: false, selectedFieldEntriesLength: 0 })}
      />,
    );
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

    rerender(
      <SchemaStructureHeader
        {...baseProps({ isEditMode: true, hasSelectedRows: true, selectedFieldEntriesLength: 2 })}
      />,
    );
    expect(screen.getAllByText("2 selected").length).toBeGreaterThan(0);
  });

  it("labels the bulk-action control 'Bulk actions'", () => {
    render(<SchemaStructureHeader {...baseProps({ isEditMode: true })} />);
    expect(screen.getAllByRole("button", { name: /Bulk actions/ }).length).toBeGreaterThan(0);
  });
});
