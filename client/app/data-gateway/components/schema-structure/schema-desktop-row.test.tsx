import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm, useFieldArray } from "react-hook-form";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";
import type { IField, ISchemaDetails } from "@/data-gateway/models/data-service";

// Isolate the row from the heavy popover/command based type selector. The trigger
// elements below are plain spans (not buttons) so `getByRole("button")` queries in
// other tests keep matching only the real action buttons.
vi.mock("./property-type-selector", () => ({
  PropertyTypeSelector: ({
    value,
    isChildType,
    onSelect,
    onOpenChange,
  }: {
    value: string;
    isChildType?: boolean;
    onSelect?: (type: string) => void;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="type-selector" data-child={String(!!isChildType)}>
      {value}
      <span data-testid="type-open" onClick={() => onOpenChange?.(true)} />
      <span data-testid="type-close" onClick={() => onOpenChange?.(false)} />
      <span data-testid="type-select" onClick={() => onSelect?.("Guid")} />
    </div>
  ),
}));

import { SchemaDesktopRow } from "./schema-desktop-row";

type RowProps = Parameters<typeof SchemaDesktopRow>[0];

function makeField(overrides: Partial<IField> = {}): IField {
  return {
    name: "email",
    type: "String",
    isArray: false,
    isPIIData: false,
    isUniqueData: false,
    description: "",
    ...overrides,
  };
}

type HarnessProps = {
  properties: IField[];
  index?: number;
} & Partial<RowProps>;

/**
 * Provides a real react-hook-form context (register/watch/setValue/errors) and
 * the FieldArrayWithId `field` the row expects, wrapped in a valid table + tooltip
 * provider so the DOM is valid.
 */
function Harness({ properties, index = 0, ...rest }: HarnessProps) {
  const form = useForm<{ properties: IField[] }>({
    defaultValues: { properties },
  });
  const { fields } = useFieldArray({ control: form.control, name: "properties" });

  return (
    <TooltipProvider>
      <table>
        <tbody>
          <SchemaDesktopRow
            field={fields[index] as RowProps["field"]}
            index={index}
            isEditMode={false}
            isReadOnly={false}
            isNewField={false}
            selectedRows={{}}
            onRowSelect={vi.fn()}
            register={form.register}
            watch={form.watch}
            setValue={form.setValue}
            errors={form.formState.errors}
            properties={properties}
            onDuplicate={vi.fn()}
            onDelete={vi.fn()}
            schemaId="s1"
            schemaName="User"
            schemaType={0}
            openTypePopoverIndex={null}
            setOpenTypePopoverIndex={vi.fn()}
            schemaItems={[]}
            onTypeSearchChange={vi.fn()}
            searchText=""
            onOpenAccessDrawer={vi.fn()}
            onOpenValidationDrawer={vi.fn()}
            totalFieldsLength={properties.length}
            visibleColumnCount={8}
            {...rest}
          />
        </tbody>
      </table>
    </TooltipProvider>
  );
}

const addressSchema = { schemaName: "Address" } as ISchemaDetails;

describe("SchemaDesktopRow", () => {
  // View mode used to be edit mode with everything switched off: a read-only
  // input per name, a disabled switch per boolean. It reads as text now.
  it("renders the property, type and description as text in view mode", () => {
    render(<Harness properties={[makeField()]} />);

    expect(screen.getByTitle("email")).toHaveTextContent("email");
    expect(screen.getByText("String")).toBeInTheDocument();
    // An em dash stands in for both "never required" and "no description".
    expect(screen.getByTitle("Never required")).toHaveTextContent("—");
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByDisplayValue("email")).not.toBeInTheDocument();
    expect(screen.queryByTestId("type-selector")).not.toBeInTheDocument();
  });

  it("puts the name in an editable input only in edit mode", () => {
    const { unmount } = render(<Harness properties={[makeField()]} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    unmount();

    render(<Harness properties={[makeField()]} isEditMode isReadOnly={false} />);
    expect(screen.getByDisplayValue("email")).not.toHaveAttribute("readonly");
  });

  it("keeps the name input read-only and muted for read-only fields in edit mode", () => {
    render(<Harness properties={[makeField()]} isEditMode isReadOnly />);
    const input = screen.getByDisplayValue("email");
    expect(input).toHaveAttribute("readonly");
    expect(input.className).toContain("cursor-not-allowed");
  });

  it("shows flags as chips in view mode, with no switches to mistake for controls", () => {
    render(
      <Harness properties={[makeField({ isPIIData: true, isUniqueData: true })]} />,
    );

    expect(screen.getByTitle("Personally identifiable data")).toHaveTextContent("PII");
    expect(screen.getByTitle("Unique")).toHaveTextContent("UQ");
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  // The type chip's own `[]` only appears for primitive types — a child-type
  // reference (Address, OrderItem) never gets one, so ARR in the flag strip
  // is the only thing that says "array" for those, and every board shows it
  // unconditionally rather than only when the type chip lacks its own hint.
  it("shows the ARR chip in the flag strip alongside the type chip's own [] ", () => {
    render(<Harness properties={[makeField({ isArray: true })]} />);

    expect(screen.getByText("String[]")).toBeInTheDocument();
    expect(screen.getByText("ARR")).toBeInTheDocument();
  });

  // Flags are click-to-toggle chips now, not switches — the design's own
  // vocabulary for ARR/PII/UQ, matching the same chip read mode already used.
  it("toggles the ARR chip through setValue in edit mode", async () => {
    const user = userEvent.setup();
    render(<Harness properties={[makeField()]} isEditMode />);
    const arrayChip = screen.getByRole("button", { name: "Array" });
    expect(arrayChip).toHaveAttribute("aria-pressed", "false");
    await user.click(arrayChip);
    expect(arrayChip).toHaveAttribute("aria-pressed", "true");
  });

  it("disables PII/unique for child types while leaving ARR editable", () => {
    render(
      <Harness
        properties={[makeField({ type: "Address" })]}
        isEditMode
        childSchema={addressSchema}
      />,
    );
    expect(screen.getByRole("button", { name: "Personally identifiable data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unique" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Array" })).not.toBeDisabled();
  });

  it("fires onToggleExpand when the expand control is clicked for a child type", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    render(
      <Harness
        properties={[makeField({ type: "Address" })]}
        childSchema={addressSchema}
        onToggleExpand={onToggleExpand}
        isExpanded={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Expand Address attributes" }));
    expect(onToggleExpand).toHaveBeenCalledWith(0);
  });

  it("shows a collapse control when the child type row is expanded", () => {
    render(
      <Harness
        properties={[makeField({ type: "Address" })]}
        childSchema={addressSchema}
        onToggleExpand={vi.fn()}
        isExpanded={true}
      />,
    );
    expect(screen.getByRole("button", { name: "Collapse Address" })).toBeInTheDocument();
  });

  it("selects a row via the checkbox in edit mode and disables it for new fields", async () => {
    const user = userEvent.setup();
    const onRowSelect = vi.fn();
    const { unmount } = render(
      <Harness properties={[makeField()]} isEditMode onRowSelect={onRowSelect} />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Select email" }));
    expect(onRowSelect).toHaveBeenCalledWith(expect.any(String), true);
    unmount();

    render(<Harness properties={[makeField()]} isEditMode isNewField />);
    expect(screen.getByRole("checkbox", { name: "Select email" })).toBeDisabled();
  });

  it("duplicates the row from the actions menu", async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    render(
      <Harness
        properties={[makeField()]}
        isEditMode
        showAccessValidationColumn={false}
        onDuplicate={onDuplicate}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More actions for email" }));
    await user.click(await screen.findByText("Duplicate"));
    expect(onDuplicate).toHaveBeenCalledWith(0);
  });

  it("deletes the row from the actions menu", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <Harness
        properties={[makeField()]}
        isEditMode
        showAccessValidationColumn={false}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More actions for email" }));
    await user.click(await screen.findByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(0);
  });

  it("hides the actions menu for read-only fields in edit mode", () => {
    render(
      <Harness
        properties={[makeField()]}
        isEditMode
        isReadOnly
        showAccessValidationColumn={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "More actions for email" }),
    ).not.toBeInTheDocument();
  });

  it("opens the access and validation drawers for a primitive field in view mode", async () => {
    const user = userEvent.setup();
    const onOpenAccessDrawer = vi.fn();
    const onOpenValidationDrawer = vi.fn();
    render(
      <Harness
        properties={[makeField()]}
        onOpenAccessDrawer={onOpenAccessDrawer}
        onOpenValidationDrawer={onOpenValidationDrawer}
      />,
    );
    await user.click(screen.getByRole("button", { name: "View access for email" }));
    expect(onOpenAccessDrawer).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Manage validations for email" }));
    expect(onOpenValidationDrawer).toHaveBeenCalledWith("email", undefined);
  });

  // The Rules column used to be bare icons with a "|" divider and a plain
  // colour swap; it's a pair of bordered chips now, tier-tinted like the CRUD
  // cells elsewhere — teal once a custom access policy exists, blue once
  // there's at least one validation rule, grey outline otherwise.
  it("tints the access and validation chips once something is actually set", () => {
    render(
      <Harness
        properties={[
          makeField({ readAccessLevel: 1, totalValidationRules: 2 }),
        ]}
      />,
    );

    const accessChip = screen.getByRole("button", { name: "View access for email" });
    expect(accessChip.className).toContain("border-access-custom-border");
    expect(accessChip.className).toContain("bg-access-custom-bg");

    const validationChip = screen.getByRole("button", {
      name: "Manage validations for email (2)",
    });
    expect(validationChip.className).toContain("border-primary/30");
    expect(validationChip.className).toContain("bg-primary/10");
    expect(validationChip).toHaveTextContent("2");
  });

  it("leaves the chips at a neutral outline when nothing is set", () => {
    render(<Harness properties={[makeField()]} />);

    const accessChip = screen.getByRole("button", { name: "View access for email" });
    expect(accessChip.className).not.toContain("border-access-custom-border");
    expect(accessChip.className).toContain("border-border/50");

    const validationChip = screen.getByRole("button", { name: "Manage validations for email" });
    expect(validationChip.className).not.toContain("bg-primary/10");
    expect(validationChip.className).toContain("border-border/50");
  });

  // Both controls were always disabled in edit mode, each with a tooltip
  // explaining why. The column goes away instead.
  it("drops the Rules column entirely in edit mode", () => {
    render(<Harness properties={[makeField()]} isEditMode />);

    expect(screen.queryByRole("button", { name: /access/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /validations/i })).not.toBeInTheDocument();
  });

  it("hides the access | validation column when showAccessValidationColumn is false", () => {
    render(<Harness properties={[makeField()]} showAccessValidationColumn={false} />);
    expect(screen.queryByRole("button", { name: /View access/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Manage validations/ }),
    ).not.toBeInTheDocument();
  });

  it("hides only the access control when showAccessColumn is false", () => {
    render(<Harness properties={[makeField()]} showAccessColumn={false} />);
    expect(screen.queryByRole("button", { name: /View access/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage validations for email" }),
    ).toBeInTheDocument();
  });

  it("renders the Default Properties section header for entity schemas", () => {
    render(
      <Harness
        properties={[makeField({ name: "ItemId" }), makeField({ name: "email" })]}
        index={0}
        schemaType={1}
      />,
    );
    expect(screen.getByRole("button", { name: /Default Properties \(1\)/ })).toBeInTheDocument();
  });

  // Was the same bg-muted/30 as several other grouping boxes on this page;
  // a primary tint sets it apart as its own thing.
  it("tints the Default Properties row's cell distinctly from a plain muted background", () => {
    render(
      <Harness
        properties={[makeField({ name: "ItemId" }), makeField({ name: "email" })]}
        index={0}
        schemaType={1}
      />,
    );
    const cell = screen.getByRole("button", { name: /Default Properties/ }).closest("td")!;
    expect(cell.className).toContain("bg-primary/5");
    expect(cell.className).not.toContain("bg-muted/30");
  });

  // The tint used to stop at the section header; the annotated screenshot
  // asked for the whole block — header and its rows — to read as one thing.
  it("also tints the default-property rows themselves, not just the header", async () => {
    const user = userEvent.setup();
    render(
      <Harness properties={[makeField({ name: "ItemId" })]} schemaType={1} isReadOnly />,
    );
    const toggle = screen.getByRole("button", { name: /Default Properties/ });
    await user.click(toggle);
    const row = screen.getByTitle("ItemId").closest("tr")!;
    expect(row.className).toContain("bg-primary/5");

    // Restore the shared module-level collapse state for other tests.
    await user.click(toggle);
  });

  // The custom-properties section used to repeat "<SchemaName> Properties
  // (N)" as its own row; the schema name is already the page's own heading,
  // and Default Properties above it is the only section worth calling out.
  it("no longer repeats the schema name as a custom-properties section row", () => {
    render(
      <Harness
        properties={[makeField({ name: "ItemId" }), makeField({ name: "email" })]}
        index={1}
        schemaType={1}
      />,
    );
    expect(screen.queryByText(/User Properties/)).not.toBeInTheDocument();
  });

  it("sanitizes disallowed characters when typing a property name", async () => {
    const user = userEvent.setup();
    render(<Harness properties={[makeField({ name: "" })]} isEditMode />);
    const input = screen.getByPlaceholderText("Click to edit");
    await user.type(input, "1na!me@x");
    // Leading digits and symbols are stripped by the onChange filter.
    expect((input as HTMLInputElement).value).toBe("namex");
  });

  it("sanitizes a pasted property name", () => {
    render(<Harness properties={[makeField({ name: "" })]} isEditMode />);
    const input = screen.getByPlaceholderText("Click to edit") as HTMLInputElement;
    input.focus();
    fireEvent.paste(input, {
      clipboardData: { getData: () => "12ab$cd" },
    });
    expect(input.value).toBe("abcd");
  });

  it("toggles PII / unique chips and edits the description in edit mode", async () => {
    const user = userEvent.setup();
    render(<Harness properties={[makeField()]} isEditMode />);

    const pii = screen.getByRole("button", { name: "Personally identifiable data" });
    await user.click(pii);
    expect(pii).toHaveAttribute("aria-pressed", "true");

    const unique = screen.getByRole("button", { name: "Unique" });
    await user.click(unique);
    expect(unique).toHaveAttribute("aria-pressed", "true");

    const description = screen.getByPlaceholderText("Add description");
    await user.type(description, "an email field");
    expect((description as HTMLInputElement).value).toBe("an email field");
  });

  it("wires the type selector open/close/select callbacks in edit mode", async () => {
    const user = userEvent.setup();
    const setOpenTypePopoverIndex = vi.fn();
    render(
      <Harness
        properties={[makeField()]}
        isEditMode
        setOpenTypePopoverIndex={setOpenTypePopoverIndex}
      />,
    );

    await user.click(screen.getByTestId("type-open"));
    expect(setOpenTypePopoverIndex).toHaveBeenCalledWith(0);

    await user.click(screen.getByTestId("type-close"));
    expect(setOpenTypePopoverIndex).toHaveBeenCalledWith(null);

    await user.click(screen.getByTestId("type-select"));
    // Selecting a type writes it back through setValue and closes the popover.
    expect(screen.getByTestId("type-selector")).toHaveTextContent("Guid");
    expect(setOpenTypePopoverIndex).toHaveBeenLastCalledWith(null);
  });

  it("collapses and expands the read-only entity section", async () => {
    const user = userEvent.setup();
    render(
      <Harness properties={[makeField({ name: "ItemId" })]} schemaType={1} isReadOnly />,
    );

    // Collapsed by default: the read-only row is not rendered.
    expect(screen.queryByTitle("ItemId")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Default Properties/ });
    await user.click(toggle);
    expect(screen.getByTitle("ItemId")).toBeInTheDocument();

    // Collapse again to restore the shared module-level state for other tests.
    await user.click(toggle);
    expect(screen.queryByTitle("ItemId")).not.toBeInTheDocument();
  });
});
