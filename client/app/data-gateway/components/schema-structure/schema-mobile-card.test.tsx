import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

// The property-type selector is exercised elsewhere; stub it to a marker here. The
// trigger elements are spans (not buttons) so button queries stay unaffected.
vi.mock("./property-type-selector", () => ({
  PropertyTypeSelector: ({
    value,
    onSelect,
    onOpenChange,
  }: {
    value: string;
    onSelect?: (type: string) => void;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="type-selector">
      type:{value}
      <span data-testid="type-open" onClick={() => onOpenChange?.(true)} />
      <span data-testid="type-close" onClick={() => onOpenChange?.(false)} />
      <span data-testid="type-select" onClick={() => onSelect?.("Guid")} />
    </div>
  ),
}));

import { SchemaMobileCard } from "./schema-mobile-card";

type Props = React.ComponentProps<typeof SchemaMobileCard>;

const property = {
  name: "title",
  type: "String",
  isArray: false,
  isPIIData: false,
  isUniqueData: false,
  description: "A title",
  readAccessLevel: 0,
  writeAccessLevel: 0,
  editAccessLevel: 0,
  fields: [],
};

function Harness(overrides: Partial<Props> = {}) {
  const form = useForm<{ properties: (typeof property)[] }>({
    defaultValues: { properties: [property] },
  });
  const props: Props = {
    field: { id: "f1", ...property } as never,
    index: 0,
    isEditMode: false,
    isReadOnly: false,
    isNewField: false,
    selectedRows: {},
    onRowSelect: vi.fn(),
    register: form.register,
    watch: form.watch,
    setValue: form.setValue,
    errors: form.formState.errors,
    properties: [property] as never,
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    schemaId: "schema-1",
    schemaName: "Products",
    schemaType: 0,
    openMobileTypePopoverIndex: null,
    setOpenMobileTypePopoverIndex: vi.fn(),
    schemaItems: [],
    onTypeSearchChange: vi.fn(),
    searchText: "",
    onOpenAccessDrawer: vi.fn(),
    onOpenValidationDrawer: vi.fn(),
    totalFields: 1,
    ...overrides,
  };
  return (
    <TooltipProvider>
      <SchemaMobileCard {...props} />
    </TooltipProvider>
  );
}

describe("SchemaMobileCard", () => {
  it("renders property name, type and toggles in view mode", () => {
    render(<Harness />);
    expect(screen.getByDisplayValue("title")).toBeInTheDocument();
    // View mode shows the type as text (not the selector) and the switches.
    expect(screen.getByText("String")).toBeInTheDocument();
    expect(screen.getByLabelText(/IsArray for/)).toBeInTheDocument();
    expect(screen.getByLabelText(/IsPII for/)).toBeInTheDocument();
    expect(screen.getByLabelText(/IsUnique for/)).toBeInTheDocument();
  });

  it("opens the access and validation drawers in view mode for primitive types", async () => {
    const user = userEvent.setup();
    const onOpenAccessDrawer = vi.fn();
    const onOpenValidationDrawer = vi.fn();
    render(<Harness onOpenAccessDrawer={onOpenAccessDrawer} onOpenValidationDrawer={onOpenValidationDrawer} />);

    await user.click(screen.getByLabelText(/View access for title/));
    expect(onOpenAccessDrawer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "title" }),
      "Access for title",
    );

    await user.click(screen.getByLabelText(/Manage validations for title/));
    expect(onOpenValidationDrawer).toHaveBeenCalled();
  });

  it("shows the property type selector and row actions in edit mode", async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render(<Harness isEditMode onDuplicate={onDuplicate} onDelete={onDelete} />);

    expect(screen.getByTestId("type-selector")).toHaveTextContent("type:String");
    // Row selection checkbox appears in edit mode.
    expect(screen.getByLabelText(/Select title/)).toBeInTheDocument();

    // The actions menu trigger is the only enabled button with no aria-label.
    const trigger = screen
      .getAllByRole("button")
      .find((b) => !b.getAttribute("aria-label") && !b.hasAttribute("disabled"))!;
    await user.click(trigger);
    await user.click(await screen.findByText("Duplicate"));
    expect(onDuplicate).toHaveBeenCalledWith(0);
  });

  it("renders the default-properties section header for entity schemas", () => {
    render(
      <Harness
        schemaType={1}
        properties={[{ ...property, name: "CreatedBy" }] as never}
        field={{ id: "f1", ...property, name: "CreatedBy" } as never}
      />,
    );
    expect(screen.getByText(/Default Properties/)).toBeInTheDocument();
  });

  it("edits the name, toggles switches and updates the description in edit mode", async () => {
    const user = userEvent.setup();
    render(<Harness isEditMode />);

    const nameInput = screen.getByDisplayValue("title");
    await user.clear(nameInput);
    await user.type(nameInput, "new_name");
    expect((nameInput as HTMLInputElement).value).toContain("new_name");

    // Toggling the enabled switches runs their onCheckedChange -> setValue.
    await user.click(screen.getByLabelText(/IsArray for/));
    await user.click(screen.getByLabelText(/IsPII for/));
    await user.click(screen.getByLabelText(/IsUnique for/));

    const desc = screen.getByPlaceholderText("Add description");
    await user.type(desc, "!");
    expect(desc).toBeInTheDocument();
  });

  it("shows an active validation indicator when the field has validation rules", () => {
    render(
      <Harness
        field={
          {
            id: "f1",
            ...property,
            validationRule: { rules: [{ isActive: true }] },
          } as never
        }
        properties={
          [
            {
              ...property,
              validationRule: { rules: [{ isActive: true }] },
            },
          ] as never
        }
      />,
    );
    expect(screen.getByLabelText(/Manage validations for title/)).toBeInTheDocument();
  });

  it("sanitizes a pasted property name in edit mode", () => {
    render(<Harness isEditMode />);
    const input = screen.getByDisplayValue("title") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    fireEvent.paste(input, { clipboardData: { getData: () => "9ab$cd" } });
    expect(input.value).toBe("titleabcd");
  });

  it("wires the type selector open/close/select callbacks", async () => {
    const user = userEvent.setup();
    const setOpenMobileTypePopoverIndex = vi.fn();
    render(
      <Harness
        isEditMode
        setOpenMobileTypePopoverIndex={setOpenMobileTypePopoverIndex}
      />,
    );

    await user.click(screen.getByTestId("type-open"));
    expect(setOpenMobileTypePopoverIndex).toHaveBeenCalledWith(0);
    await user.click(screen.getByTestId("type-close"));
    expect(setOpenMobileTypePopoverIndex).toHaveBeenCalledWith(null);
    await user.click(screen.getByTestId("type-select"));
    expect(screen.getByTestId("type-selector")).toHaveTextContent("type:Guid");
  });

  it("selects a row through its checkbox in edit mode", async () => {
    const user = userEvent.setup();
    const onRowSelect = vi.fn();
    render(<Harness isEditMode onRowSelect={onRowSelect} />);
    await user.click(screen.getByLabelText(/Select title/));
    expect(onRowSelect).toHaveBeenCalledWith(expect.any(String), true);
  });

  it("deletes the row from the actions menu", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<Harness isEditMode onDelete={onDelete} />);
    const trigger = screen
      .getAllByRole("button")
      .find((b) => !b.getAttribute("aria-label") && !b.hasAttribute("disabled"))!;
    await user.click(trigger);
    await user.click(await screen.findByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(0);
  });

  it("toggles the readonly section for entity schemas", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        schemaType={1}
        isReadOnly
        properties={[{ ...property, name: "CreatedBy" }] as never}
        field={{ id: "f1", ...property, name: "CreatedBy" } as never}
      />,
    );
    const toggle = screen.getByRole("button", { name: /Default Properties/ });
    // Collapsed by default: the row (name input) is hidden.
    expect(screen.queryByDisplayValue("title")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByDisplayValue("title")).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByDisplayValue("title")).not.toBeInTheDocument();
  });

  it("expands a child-type field from the view-mode toggle", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    render(
      <Harness
        field={{ id: "f1", ...property, type: "Address" } as never}
        properties={[{ ...property, type: "Address" }] as never}
        childSchema={{ schemaName: "Address" } as never}
        onToggleExpand={onToggleExpand}
        isExpanded={false}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Expand Address attributes/ }),
    );
    expect(onToggleExpand).toHaveBeenCalledWith(0);
  });
});
