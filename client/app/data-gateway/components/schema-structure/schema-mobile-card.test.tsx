import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

// The property-type selector is exercised elsewhere; stub it to a marker here.
vi.mock("./property-type-selector", () => ({
  PropertyTypeSelector: ({ value }: { value: string }) => (
    <div data-testid="type-selector">type:{value}</div>
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
});
