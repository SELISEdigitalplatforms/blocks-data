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
    // cmdk (the Expression menu) scrolls and measures its list.
    Element.prototype.scrollIntoView ??= () => {};
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
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

  describe("the suggested failure message", () => {
    it("writes the message from the validation as it is built, and saves it", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <SchemaFieldValidationPanel fieldName="Salary" schemaId="emp" projectKey="pk" fieldType="Float" initialValidationData={null} />
        </TooltipProvider>,
      );
      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await chooseRuleType(user, "Greater than");
      const message = screen.getByLabelText("Message shown when it fails");
      expect(message).toHaveValue("");

      await user.type(screen.getByLabelText("Value"), "100");
      expect(message).toHaveValue("Salary must be greater than 100");
      expect(screen.getByText("Written from the validation. Change it if you like.")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await waitFor(() =>
        expect(createValidation).toHaveBeenCalledWith(
          expect.objectContaining({ validations: [expect.objectContaining({ errorMessage: "Salary must be greater than 100" })] }),
        ),
      );
    });

    it("stops following the validation once edited, and can go back to the suggestion", async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <SchemaFieldValidationPanel fieldName="Salary" schemaId="emp" projectKey="pk" fieldType="Float" initialValidationData={null} />
        </TooltipProvider>,
      );
      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await chooseRuleType(user, "Greater than");
      const value = screen.getByLabelText("Value");
      await user.type(value, "100");
      const message = screen.getByLabelText("Message shown when it fails");
      await user.clear(message);
      await user.type(message, "Too low");

      await user.clear(value);
      await user.type(value, "200");
      expect(message).toHaveValue("Too low");

      await user.click(screen.getByRole("button", { name: "Use suggested message" }));
      expect(message).toHaveValue("Salary must be greater than 200");
    });

    it("keeps a saved validation's own message when it is opened", async () => {
      const user = userEvent.setup();
      renderPanel("String", [maxLength]);
      await user.click(screen.getByRole("button", { name: "Edit validation" }));
      expect(screen.getByLabelText("Message shown when it fails")).toHaveValue("Too long");
    });
  });

  describe("another property as the compared value", () => {
    function renderField(fieldName: string, fieldType: string) {
      render(
        <TooltipProvider>
          <SchemaFieldValidationPanel fieldName={fieldName} schemaId="emp" projectKey="pk" fieldType={fieldType} initialValidationData={null} />
        </TooltipProvider>,
      );
    }

    async function pickFromExpression(user: ReturnType<typeof userEvent.setup>, box: string) {
      await user.click(screen.getByRole("button", { name: `Add an expression to ${box}` }));
      return (await screen.findAllByRole("option")).map((o) => o.textContent);
    }

    it("offers properties of the same kind from the box's Expression menu and sends the variable as text (UC20)", async () => {
      const user = userEvent.setup();
      renderField("EndDate", "DateTime");
      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await chooseRuleType(user, "Greater than");

      // No Fixed value / Another property switch any more: one box, with Expression inside it.
      expect(screen.queryByRole("group", { name: "Value source" })).not.toBeInTheDocument();
      // Same kind only, and never the property itself.
      expect(await pickFromExpression(user, "Value")).toEqual(["StartDateEmployee.StartDate"]);
      await user.click(screen.getByRole("option", { name: /StartDate/ }));

      // The property replaces the box, with a way back to a fixed value.
      expect(screen.getByText("Employee.StartDate")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Use a fixed value" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Add validation" }));

      await waitFor(() =>
        expect(createValidation).toHaveBeenCalledWith(
          expect.objectContaining({
            validations: [expect.objectContaining({ type: 7, value: "{{Employee.StartDate}}", evaluationVersion: 1 })],
          }),
        ),
      );
    });

    it("goes back to a fixed value", async () => {
      const user = userEvent.setup();
      renderField("EndDate", "DateTime");
      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await chooseRuleType(user, "Greater than");
      await pickFromExpression(user, "Value");
      await user.click(screen.getByRole("option", { name: /StartDate/ }));

      await user.click(screen.getByRole("button", { name: "Use a fixed value" }));
      expect(screen.getByLabelText("Value")).toHaveAttribute("type", "datetime-local");
      expect(screen.getByLabelText("Value")).toHaveValue("");
    });

    it.each([
      ["{{Auth.UserId}}", "Auth values aren't available in validation rules at position 1: use an access policy"],
      ["{{Name}}", "Missing prefix at position 1: write {{Employee.Name}}"],
      ["{{Employee.Age}}", "Employee.Age is a number at position 1: text is expected"],
    ])("shows the error for a typed %s and disables Add (UC22, UC23)", async (typed, message) => {
      const user = userEvent.setup();
      renderField("Nickname", "String");
      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await chooseRuleType(user, "Equals");

      // userEvent treats "{" as a key descriptor; "{{" types one brace.
      await user.type(screen.getByLabelText("Value"), typed.replaceAll("{", "{{").replaceAll("[", "[["));
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add validation" })).toBeDisabled();
    });

    it("keeps a number variable as text instead of converting it", async () => {
      const user = userEvent.setup();
      renderField("Score", "Int");
      await user.click(screen.getByRole("button", { name: "Add validation" }));
      await chooseRuleType(user, "Between");
      await user.type(screen.getByLabelText("Min"), "1");
      expect(await pickFromExpression(user, "Max")).toEqual(["AgeEmployee.Age"]);
      await user.click(screen.getByRole("option", { name: /Age/ }));
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
