import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PropertyTypeSelector } from "./property-type-selector";

type Props = Parameters<typeof PropertyTypeSelector>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    index: 0,
    value: "",
    isOpen: false,
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    isReadOnly: false,
    isEditMode: true,
    schemaItems: [],
    onSearchChange: vi.fn(),
    searchText: "",
    ...overrides,
  } as Props;
}

describe("PropertyTypeSelector", () => {
  it("renders a read-only label (no combobox) when not in edit mode", () => {
    render(<PropertyTypeSelector {...baseProps({ isEditMode: false, value: "String" })} />);
    expect(screen.getByText("String")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("falls back to the placeholder label when there is no value", () => {
    render(<PropertyTypeSelector {...baseProps({ isEditMode: false, value: "" })} />);
    expect(screen.getByText("Select type...")).toBeInTheDocument();
  });

  it("renders a disabled combobox trigger when read-only in edit mode", () => {
    render(<PropertyTypeSelector {...baseProps({ isReadOnly: true, value: "Int" })} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("lists primitive types and calls onSelect when one is chosen", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PropertyTypeSelector {...baseProps({ isOpen: true, onSelect })} />);

    // Command list renders the primitive type options
    expect(screen.getByText("Primitive Types")).toBeInTheDocument();
    await user.click(screen.getByText("Boolean"));
    expect(onSelect).toHaveBeenCalledWith("Boolean");
  });

  it("renders child schema types and selects them", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PropertyTypeSelector
        {...baseProps({
          isOpen: true,
          onSelect,
          schemaItems: [{ schemaName: "Address" }] as Props["schemaItems"],
        })}
      />,
    );

    expect(screen.getByText("Child Types")).toBeInTheDocument();
    await user.click(screen.getByText("Address"));
    expect(onSelect).toHaveBeenCalledWith("Address");
  });
});
