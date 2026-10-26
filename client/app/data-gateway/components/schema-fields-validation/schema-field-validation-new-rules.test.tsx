import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

/**
 * The rule editor for the rules added by the validation and access rules plan (phase 6, design D1–D9): Is one of,
 * list rules, "Only when…", dates relative to now, the grouped target picker, Must not exist in and the filter.
 */

const createValidation = vi.fn();
const updateValidation = vi.fn();

const referenceTargets = {
  entities: [
    {
      schemaName: "Customer",
      description: "Companies and people we sell to",
      isSystemEntity: false,
      fields: [
        { name: "Email", type: "String", isArray: false, isPIIData: false, isUniqueData: true },
        { name: "Status", type: "String", isArray: false, isPIIData: false, isUniqueData: false },
      ],
    },
    { schemaName: "Lead", description: "People who may buy", isSystemEntity: false, fields: [{ name: "Email", type: "String", isArray: false, isPIIData: false, isUniqueData: false }] },
  ],
  systemEntities: [
    { schemaName: "User", description: "People who can sign in to this project", isSystemEntity: true, fields: [{ name: "Email", type: "String", isArray: false, isPIIData: false, isUniqueData: false }] },
  ],
};

vi.mock("../../hooks/use-configuration", () => ({
  useGetSchemaFieldValidation: () => ({ data: undefined, isLoading: false, isFetching: false }),
  useCreateSchemaFieldValidation: () => ({ mutateAsync: createValidation, isPending: false }),
  useUpdateSchemaFieldValidation: () => ({ mutateAsync: updateValidation, isPending: false }),
  useDeleteSchemaFieldValidation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useGenerateRegex: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReferenceTargets: () => ({ data: { data: referenceTargets }, isLoading: false }),
  useSchemaVariableContext: () => ({
    schemaName: "Lead",
    fields: {
      Email: { type: "String", isArray: false, isObject: false },
      Country: { type: "String", isArray: false, isObject: false },
      Kind: { type: "Enum", isArray: false, isObject: false },
      BirthDate: { type: "DateTime", isArray: false, isObject: false },
      Tags: { type: "String", isArray: true, isObject: false },
      Items: { type: "Item", isArray: true, isObject: true },
      "Items.Qty": { type: "Int", isArray: false, isObject: false },
    },
    enumValues: { Kind: ["Business", "Private"] },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }));

import { SchemaFieldValidationPanel } from "./schema-field-validation-panel";

function renderPanel(props: { fieldName?: string; fieldType?: string; isArray?: boolean; enumValues?: string[]; validations?: unknown[] | null } = {}) {
  const { fieldName = "Email", fieldType = "String", isArray = false, enumValues, validations = null } = props;
  render(
    <TooltipProvider>
      <SchemaFieldValidationPanel
        fieldName={fieldName}
        schemaId="lead"
        projectKey="pk"
        fieldType={fieldType}
        isArray={isArray}
        enumValues={enumValues}
        initialValidationData={(validations ? { itemId: "v1", validations } : null) as never}
      />
    </TooltipProvider>,
  );
}

async function chooseRuleType(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("combobox", { name: "Validation type" }));
  await user.click(await screen.findByRole("option", { name: label }));
}

const sent = (mock: typeof createValidation) => mock.mock.calls[0][0].validations as Array<Record<string, unknown>>;

describe("SchemaFieldValidationPanel: the newer rules", () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
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
  });

  it("groups a list property's rules by scope and tags each card (D8)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Tags", isArray: true, validations: [{ type: 15, value: 1, secondaryValue: null, errorMessage: "", isActive: true }, { type: 3, value: 30, secondaryValue: null, errorMessage: "", isActive: true, evaluationVersion: 1 }] });

    expect(screen.getByText("Whole list")).toBeInTheDocument();
    expect(screen.getByText("Each item")).toBeInTheDocument();
    expect(screen.getByText("At least 1 item")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await user.click(screen.getByRole("combobox", { name: "Validation type" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("The whole list")).toBeInTheDocument();
    expect(within(listbox).getByText("Each item")).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "No duplicates" })).toBeInTheDocument();
  });

  it("a list of objects is counted: only At least and At most items are offered", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Items", fieldType: "Item", isArray: true });
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await user.click(screen.getByRole("combobox", { name: "Validation type" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option").map((o) => o.textContent)).toEqual(["At least … items", "At most … items"]);
    await user.click(within(listbox).getByRole("option", { name: "At least … items" }));

    await user.type(screen.getByRole("spinbutton", { name: "Items" }), "1");
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await waitFor(() => expect(createValidation).toHaveBeenCalled());
    expect(sent(createValidation)[0]).toEqual(expect.objectContaining({ type: 15, value: 1 }));
  });

  it("adds an Is one of rule from typed and pasted values, sent as a list at the current version", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Is one of");

    const box = screen.getByRole("textbox", { name: "Add a value" });
    await user.type(box, "Draft{Enter}");
    await user.type(box, "Submitted, Approved,");
    expect(screen.getByText("3 of up to 500. Exact match: approved is not Approved. Paste a comma-separated list to add several.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Submitted" }));
    await user.click(screen.getByRole("button", { name: "Add validation" }));

    await waitFor(() => expect(createValidation).toHaveBeenCalled());
    expect(sent(createValidation)[0]).toEqual(expect.objectContaining({ type: 13, value: ["Draft", "Approved"], evaluationVersion: 2 }));
    expect(sent(createValidation)[0]).not.toHaveProperty("when");
  });

  it("an Enum's allowed values are toggles", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Kind", fieldType: "Enum", enumValues: ["Business", "Private", "Other"] });
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Is not one of");
    await user.click(screen.getByRole("button", { name: "Other" }));
    await user.click(screen.getByRole("button", { name: "Add validation" }));

    await waitFor(() => expect(createValidation).toHaveBeenCalled());
    expect(sent(createValidation)[0]).toEqual(expect.objectContaining({ type: 14, value: ["Other"] }));
  });

  it("adds a rule that applies only when a condition holds (D3, D6)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "VatNumber" });
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Not empty");
    expect(screen.getByText("(off: checked on every save)")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Only when…" }));
    await user.click(screen.getByRole("combobox", { name: "Condition property" }));
    await user.click(await screen.findByRole("option", { name: "Country" }));
    await user.type(screen.getByRole("textbox", { name: "Condition value" }), "DE");
    expect(screen.getByText('Country = "DE"')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add validation" }));

    await waitFor(() => expect(createValidation).toHaveBeenCalled());
    expect(sent(createValidation)[0].when).toEqual({
      logicalOperator: 0,
      rules: [expect.objectContaining({ leftSource: 1, leftOperand: "Country", operator: 0, rightSource: 2, staticValue: "DE" })],
      nestedGroups: [],
    });
  });

  it("shows a stored condition on the card, and a grouped one read-only, saved back unchanged (D7)", async () => {
    const user = userEvent.setup();
    const nested = {
      logicalOperator: 0,
      rules: [{ leftSource: 1, leftOperand: "Kind", operator: 0, rightSource: 2, rightOperand: "", staticValue: "Business" }],
      nestedGroups: [{ logicalOperator: 1, rules: [{ leftSource: 1, leftOperand: "Country", operator: 0, rightSource: 2, rightOperand: "", staticValue: "DE" }, { leftSource: 1, leftOperand: "Country", operator: 0, rightSource: 2, rightOperand: "", staticValue: "AT" }], nestedGroups: [] }],
    };
    renderPanel({ fieldName: "VatNumber", validations: [{ type: 0, value: null, secondaryValue: null, errorMessage: "Needed", isActive: true, evaluationVersion: 1, when: nested }] });

    const text = 'Kind = "Business" and (Country = "DE" or Country = "AT")';
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText("Only when")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit validation" }));
    expect(screen.getByText(/This condition has groups, so it can't be edited here/)).toBeInTheDocument();
    const message = screen.getByLabelText("Message shown when it fails");
    await user.clear(message);
    await user.type(message, "VAT number needed");
    await user.click(screen.getByRole("button", { name: "Save validation" }));

    await waitFor(() => expect(updateValidation).toHaveBeenCalled());
    expect(sent(updateValidation)[0]).toEqual(expect.objectContaining({ when: nested, evaluationVersion: 1, errorMessage: "VAT number needed" }));
  });

  it("enters a date relative to now and shows today's bound (D9)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "BirthDate", fieldType: "DateTime" });
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "At most");
    await user.click(screen.getByRole("button", { name: "Add an expression to Value" }));
    await user.click(await screen.findByRole("option", { name: /^Now/ }));

    const amount = screen.getByRole("spinbutton", { name: "Value: amount" });
    await user.clear(amount);
    await user.type(amount, "18");
    expect(screen.getByText(/Saved today, BirthDate must be on or before .*\. The bound moves with each save\. Times are UTC\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add validation" }));

    await waitFor(() => expect(createValidation).toHaveBeenCalled());
    expect(sent(createValidation)[0]).toEqual(expect.objectContaining({ type: 10, value: "{{Now-18y}}" }));
  });

  it("lists your entities, then the system entities, with their descriptions (section 8)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Exists in another schema");
    await user.click(screen.getByRole("combobox", { name: "Target schema" }));

    expect(await screen.findByText("Your entities · 2")).toBeInTheDocument();
    expect(screen.getByText("System entities · 1")).toBeInTheDocument();
    expect(screen.getByText("People who can sign in to this project")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /^User/ }));
    expect(screen.getByRole("combobox", { name: "Target schema" })).toHaveTextContent("User");
  });

  it("must not exist in: never the rule's own schema, with a filter on the target (D1)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Must not exist in another schema");
    await user.click(screen.getByRole("combobox", { name: "Target schema" }));
    expect(await screen.findByText("This schema. Use the Unique flag instead")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Lead/ })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("option", { name: /^Customer/ }));

    await user.click(screen.getByRole("switch", { name: "Only Customer records where…" }));
    await user.click(screen.getByRole("combobox", { name: "Condition property" }));
    await user.click(await screen.findByRole("option", { name: "Status" }));
    await user.type(screen.getByRole("textbox", { name: "Condition value" }), "Active");
    expect(screen.getByText(/Deleted Customer records never count\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add validation" }));

    await waitFor(() => expect(createValidation).toHaveBeenCalled());
    expect(sent(createValidation)[0]).toEqual(
      expect.objectContaining({
        type: 18,
        value: "Customer",
        secondaryValue: "ItemId",
        targetFilter: expect.objectContaining({ rules: [expect.objectContaining({ leftOperand: "Status", staticValue: "Active" })] }),
      }),
    );
  });

  it("an older Reference rule keeps its behaviour until the button is used (D2, decision 5)", async () => {
    const user = userEvent.setup();
    const older = { type: 12, value: "Customer", secondaryValue: "Email", errorMessage: "Unknown customer", isActive: true, evaluationVersion: 1 };
    renderPanel({ validations: [older] });
    expect(screen.getByText("Deleted records count · older rule")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit validation" }));
    expect(screen.getByText(/This rule was saved before deleted records were left out/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use the new behaviour" }));
    await user.click(screen.getByRole("button", { name: "Save validation" }));

    await waitFor(() => expect(updateValidation).toHaveBeenCalled());
    expect(sent(updateValidation)[0]).toEqual(expect.objectContaining({ type: 12, evaluationVersion: 2 }));
  });

  it("saving an older Reference rule without the button keeps its version", async () => {
    const user = userEvent.setup();
    renderPanel({ validations: [{ type: 12, value: "Customer", secondaryValue: "Email", errorMessage: "Unknown customer", isActive: true, evaluationVersion: 1 }] });
    await user.click(screen.getByRole("button", { name: "Edit validation" }));
    const message = screen.getByLabelText("Message shown when it fails");
    await user.clear(message);
    await user.type(message, "No such customer");
    await user.click(screen.getByRole("button", { name: "Save validation" }));

    await waitFor(() => expect(updateValidation).toHaveBeenCalled());
    expect(sent(updateValidation)[0]).toEqual(expect.objectContaining({ evaluationVersion: 1, errorMessage: "No such customer" }));
  });

  // ── Found in review ──

  it("keeps the picked unit while the amount is empty or zero (D9)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "BirthDate", fieldType: "DateTime" });
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "At most");
    await user.click(screen.getByRole("button", { name: "Add an expression to Value" }));
    await user.click(await screen.findByRole("option", { name: /^Now/ }));

    await user.click(screen.getByRole("combobox", { name: "Value: unit" }));
    await user.click(await screen.findByRole("option", { name: "days" }));
    const amount = screen.getByRole("spinbutton", { name: "Value: amount" });
    await user.clear(amount);
    await user.type(amount, "45");
    await user.click(screen.getByRole("button", { name: "Add validation" }));

    await waitFor(() => expect(createValidation).toHaveBeenCalled());
    expect(sent(createValidation)[0]).toEqual(expect.objectContaining({ value: "{{Now-45d}}" }));
  });

  it("offers no condition on a lookup rule, nor on a property inside a list of objects", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    await chooseRuleType(user, "Exists in another schema");
    expect(screen.queryByRole("switch", { name: "Only when…" })).not.toBeInTheDocument();
  });

  it("explains why a property inside a list of objects can't have a condition", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Items.Qty", fieldType: "Int" });
    await user.click(screen.getByRole("button", { name: "Add validation" }));
    expect(screen.getByRole("switch", { name: "Only when…" })).toBeDisabled();
    expect(screen.getByText("A rule on a property inside a list of objects can't have a condition yet")).toBeInTheDocument();
  });

  it("shows an Enum value that no longer exists, so it can be removed", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Kind", fieldType: "Enum", enumValues: ["Business", "Private"], validations: [{ type: 13, value: ["Business", "Gone"], secondaryValue: null, errorMessage: "", isActive: true }] });
    await user.click(screen.getByRole("button", { name: "Edit validation" }));

    const gone = screen.getByRole("button", { name: /Gone/ });
    expect(gone).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/no longer a value of Kind/)).toBeInTheDocument();
    await user.click(gone);
    await user.click(screen.getByRole("button", { name: "Save validation" }));

    await waitFor(() => expect(updateValidation).toHaveBeenCalled());
    expect(sent(updateValidation)[0]).toEqual(expect.objectContaining({ value: ["Business"] }));
  });

  it("tags a version-0 rule on a list as checking the whole list, as the server does", () => {
    renderPanel({ fieldName: "Tags", isArray: true, validations: [{ type: 3, value: 30, secondaryValue: null, errorMessage: "", isActive: true }] });
    expect(screen.getByText("Whole list")).toBeInTheDocument();
  });

  it("sends untouched rules with a condition, a filter or a list back exactly as received", async () => {
    const user = userEvent.setup();
    const conditional = {
      type: 0, value: null, secondaryValue: null, errorMessage: "", isActive: true, evaluationVersion: 1,
      when: { logicalOperator: 0, rules: [{ leftSource: 1, leftOperand: "Country", operator: 0, rightSource: 2, rightOperand: "", staticValue: "DE", description: "kept" }], nestedGroups: [] },
    };
    const filtered = {
      type: 18, value: "Customer", secondaryValue: "Email", errorMessage: "", isActive: true, evaluationVersion: 0,
      targetFilter: { logicalOperator: 0, rules: [{ leftSource: 1, leftOperand: "Status", operator: 8, rightSource: 2, rightOperand: "", staticValue: ["A", "B"] }], nestedGroups: [] },
    };
    const list = { type: 13, value: ["x", "y"], secondaryValue: null, errorMessage: "", isActive: true };
    renderPanel({ validations: [conditional, filtered, list] });

    await user.click(screen.getAllByRole("switch", { name: "Validation active" })[2]);

    await waitFor(() => expect(updateValidation).toHaveBeenCalled());
    expect(sent(updateValidation)).toEqual([conditional, filtered, { ...list, isActive: false }]);
  });
});
