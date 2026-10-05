import { render, screen, within } from "@testing-library/react";
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

  // Was h-10, taller than every other h-9 control sharing its row (the
  // rule-set-form dropdowns among them) — stood out for no reason.
  it("matches the h-9 height used by every other dropdown, in and out of edit mode", () => {
    const { rerender } = render(<PropertyTypeSelector {...baseProps({ value: "Int" })} />);
    expect(screen.getByRole("combobox").className).toContain("h-9");
    expect(screen.getByRole("combobox").className).not.toContain("h-10");

    rerender(<PropertyTypeSelector {...baseProps({ isEditMode: false, value: "Int" })} />);
    expect(screen.getByTitle("Int").className).toContain("h-9");
    expect(screen.getByTitle("Int").className).not.toContain("h-10");
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

  // SPEC #345 H1. This component renders `typeOptions` generically, so GeoJson
  // needed no code change here — which is exactly why it is worth pinning: the
  // type must show up under Primitive Types, not Child Types, where a schema
  // reference named "GeoJson" would land.
  it("offers Enum among the primitive types", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PropertyTypeSelector
        index={0}
        value=""
        isOpen={true}
        onOpenChange={() => {}}
        onSelect={onSelect}
        isReadOnly={false}
        isEditMode={true}
        schemaItems={[]}
        onSearchChange={() => {}}
        searchText=""
      />,
    );
    const primitives = screen.getByText("Enum").closest('[cmdk-group]') ?? screen.getByText("Enum").parentElement;
    expect(within(primitives as HTMLElement).getByText("Enum")).toBeInTheDocument();
    await user.click(screen.getByText("Enum"));
    expect(onSelect).toHaveBeenCalledWith("Enum");
  });

  it("offers GeoJson among the primitive types", async () => {
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

    const primitives = screen.getByText("Primitive Types").closest("[cmdk-group]");
    expect(within(primitives as HTMLElement).getByText("GeoJson")).toBeInTheDocument();

    await user.click(screen.getByText("GeoJson"));
    expect(onSelect).toHaveBeenCalledWith("GeoJson");
  });
});
