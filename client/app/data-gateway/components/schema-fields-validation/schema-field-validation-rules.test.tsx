import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

const createValidation = vi.fn();
const updateValidation = vi.fn();
const deleteValidation = vi.fn();

const schemaList = {
  items: [
    {
      id: "dep",
      schemaName: "Department",
      schemaType: 1,
      fields: [
        { name: "ItemId", type: "String", isArray: false },
        { name: "Code", type: "String", isArray: false },
        { name: "Budget", type: "Float", isArray: false },
      ],
    },
  ],
};
const useSchemaList = vi.fn((_: unknown) => ({ data: { data: schemaList }, isLoading: false }));

vi.mock("../../hooks/use-configuration", () => ({
  useGetSchemaFieldValidation: () => ({ data: undefined, isLoading: false, isFetching: false }),
  useCreateSchemaFieldValidation: () => ({ mutateAsync: createValidation, isPending: false }),
  useUpdateSchemaFieldValidation: () => ({ mutateAsync: updateValidation, isPending: false }),
  useDeleteSchemaFieldValidation: () => ({ mutateAsync: deleteValidation, isPending: false }),
  useGenerateRegex: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSchemaList: (payload: unknown) => useSchemaList(payload),
  useSchemaVariableContext: () => ({
    schemaName: "Employee",
    fields: {
      Name: { type: "String", isArray: false, isObject: false },
      Age: { type: "Int", isArray: false, isObject: false },
      StartDate: { type: "DateTime", isArray: false, isObject: false },
      EndDate: { type: "DateTime", isArray: false, isObject: false },
    },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }));

import { SchemaFieldValidationPanel } from "./schema-field-validation-panel";

const notEmpty = { type: 0, value: null, secondaryValue: null, errorMessage: "", isActive: true };
const maxLength = { type: 3, value: 50, secondaryValue: null, errorMessage: "Too long", isActive: true };

function renderPanel(fieldType: string, validations: unknown[] | null, extra: { enumValues?: string[] } = {}) {
  render(
    <TooltipProvider>
      <SchemaFieldValidationPanel
        fieldName="DepartmentId"
        schemaId="emp"
        projectKey="pk"
        fieldType={fieldType}
        enumValues={extra.enumValues}
        initialValidationData={(validations ? { itemId: "v1", validations } : null) as never}
      />
    </TooltipProvider>,
  );
}

async function chooseRuleType(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("combobox", { name: "Validation type" }));
  await user.click(await screen.findByRole("option", { name: label }));
}

async function ruleTypeOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Validation type" }));
  const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
  await user.keyboard("{Escape}");
  return options;
}

describe("SchemaFieldValidationPanel: rule types and several rules", () => {
  beforeAll(() => {
    // Radix Select uses pointer capture, which jsdom does not implement.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
  });

  beforeEach(() => {
    createValidation.mockReset().mockResolvedValue({ isSuccess: true });
    updateValidation.mockReset().mockResolvedValue({ isSuccess: true });
    deleteValidation.mockReset().mockResolvedValue({ isSuccess: true });
  });

  it("offers the rule types that fit the property's type", async () => {
    const user = userEvent.setup();
    renderPanel("Boolean", null);
    await user.click(screen.getByRole("button", { name: "Add validation" }));

    expect(await ruleTypeOptions(user)).toEqual(["Not empty", "Equals", "Does not equal"]);
  });

  it("lists each saved rule with its type and a readable summary", () => {
    renderPanel("String", [notEmpty, maxLength]);

    expect(screen.getByText("Not empty")).toBeInTheDocument();
    expect(screen.getByText("Must not be empty")).toBeInTheDocument();
    expect(screen.getByText("Max length")).toBeInTheDocument();
    expect(screen.getByText("At most 50 characters")).toBeInTheDocument();
  });

  it("adds another rule after the existing ones, sending lengths as numbers", async () => {
    const user = userEvent.setup();
    renderPanel("String", [notEmpty]);

    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Min length");
    await user.type(screen.getByLabelText("Length"), "3");
    await user.click(screen.getByRole("button", { name: "Add validation" }));

    await waitFor(() =>
      expect(updateValidation).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: "v1",
          // The existing rule is sent back untouched (no version added); only the new one is version 1.
          validations: [notEmpty, expect.objectContaining({ type: 2, value: 3, secondaryValue: null, evaluationVersion: 1 })],
        }),
      ),
    );
    expect(createValidation).not.toHaveBeenCalled();
  });

  it("refuses a range whose min is above its max", async () => {
    const user = userEvent.setup();
    renderPanel("Int", null);

    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Between");
    await user.type(screen.getByLabelText("Min"), "10");
    await user.type(screen.getByLabelText("Max"), "1");

    expect(screen.getByText("Min must be ≤ max")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add validation" })).toBeDisabled();
  });

  it("switches a rule off from the list, sending the others back untouched", async () => {
    const user = userEvent.setup();
    renderPanel("String", [notEmpty, maxLength]);

    expect(screen.getByText("2 validations")).toBeInTheDocument();
    await user.click(screen.getAllByRole("switch", { name: "Validation active" })[1]);

    await waitFor(() =>
      expect(updateValidation).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "v1", validations: [notEmpty, { ...maxLength, isActive: false }] }),
      ),
    );
    expect(await screen.findByText("Validation switched off")).toBeInTheDocument();
  });

  it("deleting one of two rules keeps the other; deleting the last removes the validation", async () => {
    const user = userEvent.setup();
    renderPanel("String", [notEmpty, maxLength]);

    await user.click(document.querySelectorAll("svg.lucide-trash")[0].closest("button")!);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(updateValidation).toHaveBeenCalledWith(expect.objectContaining({ validations: [maxLength] })),
    );
    expect(deleteValidation).not.toHaveBeenCalled();
  });

  it("deleting the only rule deletes the field's validation", async () => {
    const user = userEvent.setup();
    renderPanel("String", [notEmpty]);

    await user.click(document.querySelector("svg.lucide-trash")!.closest("button")!);
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteValidation).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" })));
    expect(updateValidation).not.toHaveBeenCalled();
  });

  it("picks a Reference target among Entity schemas, defaulting to ItemId", async () => {
    const user = userEvent.setup();
    renderPanel("String", null);

    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Exists in another schema");
    await user.click(screen.getByRole("combobox", { name: "Target schema" }));
    await user.click(await screen.findByRole("option", { name: "Department" }));

    // Only Entity schemas are searched, and the field list keeps to text fields plus ItemId.
    expect(useSchemaList).toHaveBeenCalledWith(expect.objectContaining({ schemaType: "1", projectKey: "pk" }));
    expect(within(screen.getByRole("combobox", { name: "Target field" })).getByText("ItemId")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await waitFor(() =>
      expect(createValidation).toHaveBeenCalledWith(
        expect.objectContaining({
          validations: [expect.objectContaining({ type: 12, value: "Department", secondaryValue: "ItemId" })],
        }),
      ),
    );
  });

  it("offers Reference only once per field", async () => {
    const user = userEvent.setup();
    renderPanel("String", [{ type: 12, value: "Department", secondaryValue: "ItemId", errorMessage: "", isActive: true }]);

    expect(screen.getByText("Must exist in Department.ItemId")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    expect(await ruleTypeOptions(user)).not.toContain("Exists in another schema");
  });

  describe("variables in comparison values", () => {
    async function addGreaterThan(user: ReturnType<typeof userEvent.setup>, fieldType: string) {
      render(
        <TooltipProvider>
          <SchemaFieldValidationPanel fieldName="EndDate" schemaId="emp" projectKey="pk" fieldType={fieldType} initialValidationData={null} />
        </TooltipProvider>,
      );
      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await chooseRuleType(user, "Greater than");
      await user.click(within(screen.getByRole("group", { name: "Value source" })).getByRole("radio", { name: "Another property" }));
    }

    it("offers properties of the same kind and sends the variable as text (UC20)", async () => {
      const user = userEvent.setup();
      await addGreaterThan(user, "DateTime");

      await user.click(screen.getByRole("combobox", { name: "Pick a property for Value" }));
      const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
      // Same kind only, and never the property itself.
      expect(options).toEqual(["{{Employee.StartDate}}"]);
      await user.click(screen.getByRole("option", { name: "{{Employee.StartDate}}" }));
      await user.click(screen.getByRole("button", { name: "Add validation" }));

      await waitFor(() =>
        expect(createValidation).toHaveBeenCalledWith(
          expect.objectContaining({
            validations: [expect.objectContaining({ type: 7, value: "{{Employee.StartDate}}", evaluationVersion: 1 })],
          }),
        ),
      );
    });

    it.each([
      ["{{Auth.UserId}}", "Auth values aren't available in validation rules at position 1: use an access policy"],
      ["{{StartDate}}", "Missing prefix at position 1: write {{Employee.StartDate}}"],
      ["{{Employee.Name}}", "Employee.Name is text at position 1: a date-time is expected"],
    ])("shows the error for %s and disables Add (UC22, UC23)", async (typed, message) => {
      const user = userEvent.setup();
      await addGreaterThan(user, "DateTime");

      // userEvent treats "{" as a key descriptor; "{{" types one brace.
      await user.type(screen.getByLabelText("Value"), typed.replaceAll("{", "{{").replaceAll("[", "[["));
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add validation" })).toBeDisabled();
    });

    it("keeps a number variable as text instead of converting it", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <SchemaFieldValidationPanel fieldName="Score" schemaId="emp" projectKey="pk" fieldType="Int" initialValidationData={null} />
        </TooltipProvider>,
      );
      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await chooseRuleType(user, "Between");
      await user.type(screen.getByLabelText("Min"), "1");
      await user.click(within(screen.getByRole("group", { name: "Max source" })).getByRole("radio", { name: "Another property" }));
      await user.click(screen.getByRole("combobox", { name: "Pick a property for Max" }));
      await user.click(await screen.findByRole("option", { name: "{{Employee.Age}}" }));
      await user.click(screen.getByRole("button", { name: "Add validation" }));

      await waitFor(() =>
        expect(createValidation).toHaveBeenCalledWith(
          expect.objectContaining({
            validations: [expect.objectContaining({ type: 11, value: 1, secondaryValue: "{{Employee.Age}}" })],
          }),
        ),
      );
    });
  });
});
