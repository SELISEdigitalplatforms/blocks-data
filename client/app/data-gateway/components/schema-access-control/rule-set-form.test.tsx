import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Radix Select relies on pointer-capture and scrollIntoView APIs jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const createPolicy = vi.fn();
const updatePolicy = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useCreatePolicy: () => ({ mutateAsync: createPolicy, isPending: false }),
  useUpdatePolicy: () => ({ mutateAsync: updatePolicy, isPending: false }),
}));
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("./schema-access-control-accordion", () => ({
  SchemaAccessControlAccordion: () => <div data-testid="sac-accordion" />,
}));

import { RuleSetForm } from "./rule-set-form";

const schemaFields = [
  { name: "title", type: "String", isArray: false },
  { name: "count", type: "Int", isArray: false },
  { name: "tags", type: "String", isArray: true },
];

// A policy exercising every render branch: equal-static, is-null, in-static,
// in-authfield (multi-select), and a direct-value (start-with) rule.
const editingPolicy = {
  itemId: "policy-1",
  policyName: "My Rule Set",
  policyDescription: "desc",
  fieldNames: ["title"],
  priority: 3,
  isAllowPolicy: true,
  ruleGroup: {
    logicalOperator: 0, // AND
    rules: [
      { leftSource: 0, leftOperand: "userId", operator: 0, rightSource: 2, rightOperand: "", staticValue: "abc" },
      { leftSource: 1, leftOperand: "title", operator: 12, rightSource: 2, rightOperand: "", staticValue: null },
      { leftSource: 0, leftOperand: "roles", operator: 8, rightSource: 2, rightOperand: "", staticValue: ["a", "b"] },
      { leftSource: 0, leftOperand: "roles", operator: 8, rightSource: 0, rightOperand: ["email"], staticValue: null },
      { leftSource: 1, leftOperand: "title", operator: 10, rightSource: 2, rightOperand: "", staticValue: "pre" },
    ],
    nestedGroups: [],
  },
} as unknown as Parameters<typeof RuleSetForm>[0]["editingPolicy"];

const baseProps = {
  schemaFields,
  schemaName: "Products",
  schemaId: "schema-1",
  operation: 0,
  fieldNames: ["title"],
  level: "row" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  createPolicy.mockResolvedValue({ isSuccess: true });
  updatePolicy.mockResolvedValue({ isSuccess: true });
});

describe("RuleSetForm", () => {
  it("renders the empty state and adds then removes a rule", async () => {
    const user = userEvent.setup();
    render(<RuleSetForm {...baseProps} />);

    expect(
      screen.getByText("No rules added yet. Add a rule to define who can view."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    // A rule card now shows the source placeholder.
    expect(screen.getByText("Select source")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove rule" }));
    expect(
      screen.getByText("No rules added yet. Add a rule to define who can view."),
    ).toBeInTheDocument();
  });

  it("fires onCancel from the Cancel button", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RuleSetForm {...baseProps} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("prefills and renders every rule branch in edit mode", () => {
    render(<RuleSetForm {...baseProps} editingPolicy={editingPolicy} />);
    // Name prefilled from the policy.
    expect(screen.getByDisplayValue("My Rule Set")).toBeInTheDocument();
    // The Update button is shown in edit mode.
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    // Direct-value (START_WITH) rule shows its dedicated prefix input.
    expect(screen.getByPlaceholderText("Enter prefix")).toBeInTheDocument();
    // IN + static rule renders the comma-separated input.
    expect(
      screen.getByPlaceholderText("Enter comma-separated values"),
    ).toBeInTheDocument();
    // Five rules => five remove buttons.
    expect(screen.getAllByRole("button", { name: "Remove rule" })).toHaveLength(5);
  });

  it("submits an update, maps rules to a rule group, and reports success", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RuleSetForm {...baseProps} editingPolicy={editingPolicy} onCancel={onCancel} />);

    // Trigger validation so the Update button becomes enabled.
    const nameInput = screen.getByDisplayValue("My Rule Set");
    fireEvent.change(nameInput, { target: { value: "My Rule Set!" } });

    const updateBtn = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateBtn).toBeEnabled());
    await user.click(updateBtn);

    await waitFor(() => expect(updatePolicy).toHaveBeenCalled());
    const payload = updatePolicy.mock.calls[0][0];
    expect(payload).toMatchObject({
      itemId: "policy-1",
      policyName: "My Rule Set!",
      schemaName: "Products",
      projectKey: "tenant-1",
    });
    // Rule group carries all five mapped rules with the AND operator.
    expect(payload.ruleGroup.logicalOperator).toBe(0);
    expect(payload.ruleGroup.rules).toHaveLength(5);
    // Direct-value op keeps staticValue, IN + static splits to an array.
    const startWith = payload.ruleGroup.rules.find((r: { operator: number }) => r.operator === 10);
    expect(startWith.staticValue).toBe("pre");
    const inStatic = payload.ruleGroup.rules.find(
      (r: { operator: number; rightSource: number }) => r.operator === 8 && r.rightSource === 2,
    );
    expect(inStatic.staticValue).toEqual(["a", "b"]);

    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows an error toast when the update fails", async () => {
    updatePolicy.mockResolvedValue({ isSuccess: false, errors: ["nope"] });
    render(<RuleSetForm {...baseProps} editingPolicy={editingPolicy} />);
    const nameInput = screen.getByDisplayValue("My Rule Set");
    fireEvent.change(nameInput, { target: { value: "Renamed" } });
    const updateBtn = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateBtn).toBeEnabled());
    fireEvent.click(updateBtn);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("shows an error toast when the update throws", async () => {
    updatePolicy.mockRejectedValue(new Error("network"));
    render(<RuleSetForm {...baseProps} editingPolicy={editingPolicy} />);
    const nameInput = screen.getByDisplayValue("My Rule Set");
    fireEvent.change(nameInput, { target: { value: "Renamed2" } });
    const updateBtn = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateBtn).toBeEnabled());
    fireEvent.click(updateBtn);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});

describe("RuleSetForm create flow", () => {
  // Pick option `name` in the Nth rule-row combobox (source, field, operator,
  // compareSource render in that DOM order).
  const pick = async (
    user: ReturnType<typeof userEvent.setup>,
    index: number,
    name: RegExp | string,
  ) => {
    const combos = screen.getAllByRole("combobox");
    await user.click(combos[index]);
    await user.click(await screen.findByRole("option", { name }));
  };

  it("builds an EQUAL + static-value rule and creates the policy", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onCancel = vi.fn();
    render(<RuleSetForm {...baseProps} onCancel={onCancel} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Access set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));

    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, /^Equal$/);
    await pick(user, 3, "Static Value");

    fireEvent.change(screen.getByPlaceholderText("Enter value"), {
      target: { value: "user-123" },
    });

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(createPolicy).toHaveBeenCalled());
    const payload = createPolicy.mock.calls[0][0];
    expect(payload).toMatchObject({
      policyName: "Access set",
      schemaName: "Products",
      projectKey: "tenant-1",
      priority: 1,
      isAllowPolicy: true,
    });
    expect(payload.ruleGroup.rules).toHaveLength(1);
    const rule = payload.ruleGroup.rules[0];
    // Auth => 0, EQUAL => 0, Static Value right source => 2, static value kept.
    expect(rule).toMatchObject({
      leftSource: 0,
      leftOperand: "userId",
      operator: 0,
      rightSource: 2,
      staticValue: "user-123",
    });
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    expect(onCancel).toHaveBeenCalled();
  });

  it("hides the compare inputs for an IS_NULL operator and creates the policy", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Null set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));

    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, "Is Null");

    // Compare source / value controls are gone for null operators.
    expect(screen.queryByText("Compare with")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Enter value")).not.toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(createPolicy).toHaveBeenCalled());
    const rule = createPolicy.mock.calls[0][0].ruleGroup.rules[0];
    expect(rule.operator).toBe(12);
    expect(rule.staticValue).toBeNull();
  });

  it("renders a dedicated prefix input for START_WITH", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Prefix set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));

    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, "Start With");

    const prefixInput = await screen.findByPlaceholderText("Enter prefix");
    fireEvent.change(prefixInput, { target: { value: "adm" } });

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(createPolicy).toHaveBeenCalled());
    const rule = createPolicy.mock.calls[0][0].ruleGroup.rules[0];
    // START_WITH => 10, value stored as staticValue.
    expect(rule.operator).toBe(10);
    expect(rule.staticValue).toBe("adm");
  });

  it("collects comma-separated values for an IN + static rule", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "In set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));

    await pick(user, 0, "Auth");
    await pick(user, 1, "Roles");
    await pick(user, 2, /^In$/);
    await pick(user, 3, "Static Value");

    const listInput = await screen.findByPlaceholderText(
      "Enter comma-separated values",
    );
    fireEvent.change(listInput, { target: { value: "a, b , c" } });

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(createPolicy).toHaveBeenCalled());
    const rule = createPolicy.mock.calls[0][0].ruleGroup.rules[0];
    // IN => 8, trimmed static array.
    expect(rule.operator).toBe(8);
    expect(rule.staticValue).toEqual(["a", "b", "c"]);
  });

  it("shows an error toast when create returns a failure", async () => {
    createPolicy.mockResolvedValue({ isSuccess: false, errors: ["bad"] });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Fail set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, "Is Null");

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("shows an error toast when create throws", async () => {
    createPolicy.mockRejectedValue(new Error("network"));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Throw set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, "Is Null");

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
