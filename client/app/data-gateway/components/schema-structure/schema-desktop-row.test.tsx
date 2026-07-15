import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm, useFieldArray } from "react-hook-form";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";
import type { IField, ISchemaDetails } from "@/data-gateway/models/data-service";

// Isolate the row from the heavy popover/command based type selector.
vi.mock("./property-type-selector", () => ({
  PropertyTypeSelector: ({
    value,
    isChildType,
  }: {
    value: string;
    isChildType?: boolean;
  }) => (
    <div data-testid="type-selector" data-child={String(!!isChildType)}>
      {value}
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
            totalFields={properties.length}
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
  it("renders the property name, type and description in view mode", () => {
    render(<Harness properties={[makeField()]} />);
    expect(screen.getByDisplayValue("email")).toBeInTheDocument();
    expect(screen.getByTestId("type-selector")).toHaveTextContent("String");
    expect(screen.getByPlaceholderText("—")).toBeInTheDocument();
  });

  it("makes the name input read-only in view mode and editable in edit mode", () => {
    const { unmount } = render(<Harness properties={[makeField()]} />);
    expect(screen.getByDisplayValue("email")).toHaveAttribute("readonly");
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

  it("disables the array/PII/unique switches in view mode", () => {
    render(<Harness properties={[makeField()]} />);
    expect(screen.getByRole("switch", { name: "IsArray for email" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "IsPII for email" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "IsUnique for email" })).toBeDisabled();
  });

  it("toggles the IsArray switch through setValue in edit mode", async () => {
    const user = userEvent.setup();
    render(<Harness properties={[makeField()]} isEditMode />);
    const arraySwitch = screen.getByRole("switch", { name: "IsArray for email" });
    expect(arraySwitch).toHaveAttribute("aria-checked", "false");
    await user.click(arraySwitch);
    expect(arraySwitch).toHaveAttribute("aria-checked", "true");
  });

  it("disables PII/unique for child types while leaving IsArray editable", () => {
    render(
      <Harness
        properties={[makeField({ type: "Address" })]}
        isEditMode
        childSchema={addressSchema}
      />,
    );
    expect(screen.getByRole("switch", { name: "IsPII for email" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "IsUnique for email" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "IsArray for email" })).not.toBeDisabled();
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
    await user.click(screen.getByRole("button"));
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
    await user.click(screen.getByRole("button"));
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
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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

  it("disables access and validation controls while in edit mode", () => {
    render(<Harness properties={[makeField()]} isEditMode />);
    expect(
      screen.getByRole("button", { name: "Exit edit mode to manage access" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Exit edit mode to manage validations" }),
    ).toBeDisabled();
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

  it("renders the custom Properties section header for entity schemas", () => {
    render(
      <Harness
        properties={[makeField({ name: "ItemId" }), makeField({ name: "email" })]}
        index={1}
        schemaType={1}
      />,
    );
    expect(screen.getByText("User Properties (1)")).toBeInTheDocument();
  });

  it("collapses and expands the read-only entity section", async () => {
    const user = userEvent.setup();
    render(
      <Harness properties={[makeField({ name: "ItemId" })]} schemaType={1} isReadOnly />,
    );

    // Collapsed by default: the read-only row (name input) is not rendered.
    expect(screen.queryByDisplayValue("ItemId")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Default Properties/ });
    await user.click(toggle);
    expect(screen.getByDisplayValue("ItemId")).toBeInTheDocument();

    // Collapse again to restore the shared module-level state for other tests.
    await user.click(toggle);
    expect(screen.queryByDisplayValue("ItemId")).not.toBeInTheDocument();
  });
});
