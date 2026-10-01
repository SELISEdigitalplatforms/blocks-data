import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Radix Select relies on pointer-capture and scrollIntoView APIs jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

// The form no longer calls the create/update API itself — it hands the built
// payload to `onStage` and the host (schema-access-control-view.tsx) decides
// what to do with it. These tests are about what gets built and handed over,
// not about any network call.
const onStage = vi.fn();

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
  // The form now reaches the IAM role/user services (via the principal selector), and
  // app/lib/http-client.ts constructs HttpClient instances at import time - so this partial
  // mock has to supply a constructible stub or the module graph throws on load.
  HttpClient: class {},
}));
vi.mock("./schema-access-control-accordion", () => ({
  SchemaAccessControlAccordion: () => <div data-testid="sac-accordion" />,
}));

// auth.roles / auth.userId + static value now render the tenant-scoped principal selector, which
// reaches the IAM role/user services. Stubbed so these form tests stay about the form.
const getRoles = vi.fn(async () => ({ data: [], totalCount: 0, errors: null }));
const getUsers = vi.fn(async () => ({ data: [], totalCount: 0, errors: null }));
const getUserById = vi.fn(async () => ({ data: undefined, errors: null }));
vi.mock("@blocks-idp/iam/services/role.service", () => ({
  roleService: { getRoles: (...a: unknown[]) => getRoles(...a) },
}));
vi.mock("@blocks-idp/iam/services/user.service", () => ({
  userService: {
    getUsers: (...a: unknown[]) => getUsers(...a),
    getUserById: (...a: unknown[]) => getUserById(...a),
  },
}));

import { RuleSetForm } from "./rule-set-form";

/** The principal selector uses React Query, so the form now needs a client in tests. */
const render = (ui: ReactElement) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

const schemaFields = [
  { name: "title", type: "String", isArray: false },
  { name: "count", type: "Int", isArray: false },
  { name: "tags", type: "String", isArray: true },
  { name: "AllowedRoles", type: "String", isArray: true },
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
      {
        leftSource: 0,
        leftOperand: "userId",
        operator: 0,
        rightSource: 2,
        rightOperand: "",
        staticValue: "abc",
      },
      {
        leftSource: 1,
        leftOperand: "title",
        operator: 12,
        rightSource: 2,
        rightOperand: "",
        staticValue: null,
      },
      {
        leftSource: 0,
        leftOperand: "roles",
        operator: 8,
        rightSource: 2,
        rightOperand: "",
        staticValue: ["a", "b"],
      },
      {
        leftSource: 0,
        leftOperand: "roles",
        operator: 8,
        rightSource: 0,
        rightOperand: "email",
        staticValue: null,
      },
      {
        leftSource: 1,
        leftOperand: "title",
        operator: 10,
        rightSource: 2,
        rightOperand: "",
        staticValue: "pre",
      },
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
  onStage,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RuleSetForm", () => {
  it("renders the empty state and adds then removes a rule", async () => {
    const user = userEvent.setup();
    render(<RuleSetForm {...baseProps} />);

    expect(
      screen.getByText("No rules added yet. Add a rule to define who can view."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    // A rule card now shows an empty "Not set" chip for the source column, ready to be opened.
    expect(screen.getByRole("button", { name: "Set Left operand" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove rule" }));
    expect(
      screen.getByText("No rules added yet. Add a rule to define who can view."),
    ).toBeInTheDocument();
  });

  it("reveals each labeled rule field only after the previous choice", async () => {
    const user = userEvent.setup();
    render(<RuleSetForm {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    expect(screen.getByText("Condition 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Condition 1 expression")).toBeInTheDocument();
    expect(screen.getByText("Left operand")).toBeInTheDocument();
    expect(screen.getByText("Right value")).toBeInTheDocument();

    // Only the source column can be opened yet; later columns wait for their
    // prerequisite and render as a disabled, unclickable "Not set" cell.
    expect(screen.getByRole("button", { name: "Set Left operand" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set Left value" })).not.toBeInTheDocument();
    expect(screen.queryByText("Select field")).not.toBeInTheDocument();

    // The source column is a popover of options that opens on one click —
    // no separate combobox trigger to open first.
    await user.click(screen.getByRole("button", { name: "Set Left operand" }));
    await user.click(await screen.findByRole("option", { name: "Auth" }));
    // Picking a source auto-advances to the field column's editor, which is
    // still a Select (its shape varies with the row, unlike the fixed lists).
    expect(screen.getByRole("button", { name: "Set Left value" })).toBeInTheDocument();
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
    // Completed direct values are summarized as expression chips.
    expect(screen.queryByPlaceholderText("Enter prefix")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pre" })).toBeInTheDocument();
    // auth.roles + IN + static now renders the principal multi-select instead of free text, and
    // hydrates the stored slugs verbatim - this is the H5 edit path, where the stored values must
    // survive even before (or without) resolution against IAM.
    expect(screen.queryByPlaceholderText("Enter comma-separated values")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /a, b/ }).length).toBeGreaterThan(0);
    // Five rules => five remove buttons.
    expect(screen.getAllByRole("button", { name: "Remove rule" })).toHaveLength(5);
  });

  it("stages an update, mapping rules to a rule group, instead of sending it", async () => {
    const user = userEvent.setup();
    render(<RuleSetForm {...baseProps} editingPolicy={editingPolicy} />);

    // Trigger validation so the Update button becomes enabled.
    const nameInput = screen.getByDisplayValue("My Rule Set");
    fireEvent.change(nameInput, { target: { value: "My Rule Set!" } });

    const updateBtn = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateBtn).toBeEnabled());
    await user.click(updateBtn);

    await waitFor(() => expect(onStage).toHaveBeenCalled());
    const [{ payload, isEditMode }] = onStage.mock.calls[0];
    expect(isEditMode).toBe(true);
    expect(payload).toMatchObject({
      itemId: "policy-1",
      policyName: "My Rule Set!",
      schemaName: "Products",
      projectKey: "tenant-1",
    });
    // Rule group carries all five mapped rules with the AND operator.
    expect(payload.ruleGroup.logicalOperator).toBe(0);
    expect(payload.ruleGroup.rules).toHaveLength(5);
    // Direct-value op keeps staticValue; IN + static uses the API's
    // comma-delimited wire format.
    const startWith = payload.ruleGroup.rules.find((r: { operator: number }) => r.operator === 10);
    expect(startWith.staticValue).toBe("pre");
    const inStatic = payload.ruleGroup.rules.find(
      (r: { operator: number; rightSource: number }) => r.operator === 8 && r.rightSource === 2,
    );
    expect(inStatic.staticValue).toBe("a, b");
  });
});

describe("RuleSetForm create flow", () => {
  // Source/operator/compareSource are a popover of options that opens on one
  // click — but each pick closes it rather than chaining straight into the
  // next popover (two Radix popovers opening back-to-back within one click is
  // unreliable), so every popover column needs its own opening click here.
  // Every fixed-option column uses the same chip popover.
  const POPOVER_OPEN_LABEL: Record<number, string> = {
    0: "Set Left operand",
    1: "Set Left value",
    2: "Set Operator",
    3: "Set Right operand",
    4: "Set Right value",
  };
  const pick = async (
    user: ReturnType<typeof userEvent.setup>,
    index: number,
    name: RegExp | string,
  ) => {
    const combobox = screen.queryByRole("combobox");
    if (combobox) {
      await user.click(combobox);
    } else if (!screen.queryAllByRole("option").length && POPOVER_OPEN_LABEL[index]) {
      await user.click(screen.getByRole("button", { name: POPOVER_OPEN_LABEL[index] }));
    }
    await user.click(await screen.findByRole("option", { name }));
  };

  const completeNullRule = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, "Is Null");
  };

  it("builds an EQUAL + static-value rule and stages it", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Access set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));

    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, /^Equal$/);
    await pick(user, 3, "Static Value");

    // auth.userId + static value is now a tenant-scoped user selector, not free text (H3).
    getUsers.mockResolvedValue({
      data: [
        {
          itemId: "user-123",
          firstName: "Ada",
          lastName: "Lovelace",
          userName: "ada",
          email: "ada@example.com",
          active: true,
        },
      ],
      totalCount: 1,
      errors: null,
    } as never);
    await user.click(screen.getByRole("button", { name: /Select user/ }));
    await user.click(await screen.findByText("Ada Lovelace"));

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(onStage).toHaveBeenCalled());
    const [{ payload, isEditMode }] = onStage.mock.calls[0];
    expect(isEditMode).toBe(false);
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
  });

  it("hides the compare inputs for an IS_NULL operator and stages the policy", async () => {
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

    await waitFor(() => expect(onStage).toHaveBeenCalled());
    const rule = onStage.mock.calls[0][0].payload.ruleGroup.rules[0];
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

    await waitFor(() => expect(onStage).toHaveBeenCalled());
    const rule = onStage.mock.calls[0][0].payload.ruleGroup.rules[0];
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

    // auth.roles + IN is now a tenant-scoped multi-select of role slugs (H2). The mapping below is
    // unchanged: the selector writes the same comma-delimited form state the free-text input did,
    // and buildRuleGroup still splits it into an ordered string[].
    getRoles.mockResolvedValue({
      data: [
        { itemId: "r-a", name: "Role A", slug: "a", description: "" },
        { itemId: "r-b", name: "Role B", slug: "b", description: "" },
        { itemId: "r-c", name: "Role C", slug: "c", description: "" },
      ],
      totalCount: 3,
      errors: null,
    } as never);

    await user.click(screen.getByRole("button", { name: /Select role/ }));
    await user.click(await screen.findByText("Role A"));
    await user.click(await screen.findByText("Role B"));
    await user.click(await screen.findByText("Role C"));

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(onStage).toHaveBeenCalled());
    const rule = onStage.mock.calls[0][0].payload.ruleGroup.rules[0];
    // IN => 8, comma-delimited static value in selection order.
    expect(rule.operator).toBe(8);
    expect(rule.staticValue).toBe("a,b,c");
  });

  it("allows Auth Roles IN an array schema field", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Role intersection" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));

    await pick(user, 0, "Auth");
    await pick(user, 1, "Roles");
    await pick(user, 2, /^In$/);
    await pick(user, 3, "Products");

    await user.click(screen.getByRole("button", { name: "Select fields" }));
    await user.click(await screen.findByText("title"));
    await user.click(await screen.findByText("AllowedRoles"));

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(onStage).toHaveBeenCalled());
    expect(onStage.mock.calls[0][0].payload.ruleGroup.rules[0]).toMatchObject({
      leftSource: 0,
      leftOperand: "roles",
      operator: 8,
      rightSource: 1,
      rightOperand: "title",
      rightOperands: ["title", "AllowedRoles"],
      staticValue: null,
    });
  });

  it("submits through the native form submit handler", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Native submit" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, "Is Null");

    // Fire the form's own submit event (covers the onSubmit preventDefault path).
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(onStage).toHaveBeenCalled());
  });

  it("appends a second rule from the bottom Add Rule button", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    await completeNullRule(user);
    // A completed rule reveals the action for appending another.
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    expect(screen.getAllByRole("button", { name: "Remove rule" })).toHaveLength(2);
  });

  // The group's AND/OR mode is always visible above the rule table.
  it("shows the multi-rule relation as a Match all / Match any chip toggle", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    expect(screen.getByRole("radiogroup", { name: "Multi-rule relations" })).toBeInTheDocument();
    await completeNullRule(user);
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    const matchAll = screen.getByRole("radio", { name: "Match all" });
    const matchAny = screen.getByRole("radio", { name: "Match any" });
    expect(matchAll).toHaveAttribute("aria-checked", "true");
    expect(matchAny).toHaveAttribute("aria-checked", "false");

    await user.click(matchAny);
    expect(matchAny).toHaveAttribute("aria-checked", "true");
    expect(matchAll).toHaveAttribute("aria-checked", "false");
  });

  it("renders Match all / Match any as compact rectangular chips", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    await completeNullRule(user);
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    expect(screen.getByRole("radiogroup", { name: "Multi-rule relations" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Match all" }).className).toContain("rounded-sm");
    expect(screen.getByRole("radio", { name: "Match any" }).className).toContain("rounded-sm");
  });

  it("keeps the selected AND/OR matching mode above the rule table", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    const matchAll = screen.getByRole("radio", { name: "Match all" });
    const matchAny = screen.getByRole("radio", { name: "Match any" });
    expect(matchAll).toHaveAttribute("aria-checked", "true");

    await user.click(matchAny);
    expect(matchAny).toHaveAttribute("aria-checked", "true");
    expect(matchAll).toHaveAttribute("aria-checked", "false");
  });

  it("multi-selects auth fields for an IN comparison against Auth", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Multi set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Auth");
    await pick(user, 1, "Roles");
    await pick(user, 2, /^In$/);
    await pick(user, 3, "Auth");

    // The multi-select popover trigger appears for IN + non-static compare source.
    await user.click(screen.getByRole("button", { name: /Select fields/ }));
    // cmdk renders each option with role="option".
    const option = await screen.findByRole("option", { name: "UserId" });
    await user.click(option);
    // Toggling the same option again exercises the deselect branch.
    await user.click(screen.getByRole("option", { name: "UserId" }));
  });

  it("filters right-hand schema fields for a string left operand", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Schema string set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Products");
    await pick(user, 1, "title");
    await pick(user, 2, /^Equal$/);
    await pick(user, 3, "Products");
    // Right side offers string/array schema fields (title, tags).
    await pick(user, 4, "tags");

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await waitFor(() => expect(onStage).toHaveBeenCalled());
  });

  it("drops Auth and filters numeric schema fields for a numeric left operand", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Numeric set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Products");
    await pick(user, 1, "count");
    await pick(user, 2, /^Equal$/);
    // Numeric left operands cannot compare against Auth, so that option is gone.
    await user.click(screen.getByRole("button", { name: "Set Right operand" }));
    expect(screen.queryByRole("option", { name: "Auth" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Products" }));
    await pick(user, 4, "count");

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await waitFor(() => expect(onStage).toHaveBeenCalled());
  });

  it("clears an incompatible operator when the left field category changes", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, "Start With");
    // The START_WITH operator shows a dedicated prefix input.
    expect(screen.getByPlaceholderText("Enter prefix")).toBeInTheDocument();
    // Switching to an array field (Roles) invalidates START_WITH, resetting it,
    // so the direct-value prefix input disappears.
    await user.click(screen.getByTitle("Edit field"));
    await pick(user, 1, "Roles");
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Enter prefix")).not.toBeInTheDocument(),
    );
  });

  it("uses a single select for an EQUAL comparison against an Auth field", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RuleSetForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Single set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, /^Equal$/);
    await pick(user, 3, "Auth");

    // compareValue renders as a single-select of auth fields; pick one.
    await pick(user, 4, "Email");

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await waitFor(() => expect(onStage).toHaveBeenCalled());
  });

  it("offers nested child-schema properties as dotted-path field options, capped at MAX_NESTED_FIELD_DEPTH", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const nestedSchemaFields = [
      { name: "title", type: "String", isArray: false },
      {
        name: "AddressInfo",
        type: "AddressInfo",
        isArray: false,
        fields: [
          { name: "StreetNo", type: "String", isArray: false },
          { name: "City", type: "String", isArray: false },
          {
            name: "Country",
            type: "CountryInfo",
            isArray: false,
            fields: [
              { name: "Name", type: "String", isArray: false },
              {
                // 4th nesting level - beyond MAX_NESTED_FIELD_DEPTH (3), so it
                // and its descendants must not appear as selectable options.
                name: "Region",
                type: "RegionInfo",
                isArray: false,
                fields: [{ name: "Code", type: "String", isArray: false }],
              },
            ],
          },
        ],
      },
    ];
    render(<RuleSetForm {...baseProps} schemaFields={nestedSchemaFields} />);

    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Nested set" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
    await pick(user, 0, "Products");

    await user.click(screen.getByRole("button", { name: "Set Left value" }));
    // The composite "AddressInfo" node itself is not a selectable leaf...
    expect(screen.queryByRole("option", { name: "AddressInfo" })).not.toBeInTheDocument();
    // ...but its own and its nested child's scalar properties are, as dotted paths.
    expect(screen.getByRole("option", { name: "AddressInfo.StreetNo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "AddressInfo.Country.Name" })).toBeInTheDocument();
    // A 4th-level property (beyond the depth cap) is dropped entirely.
    expect(screen.queryByRole("option", { name: /Region/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "AddressInfo.StreetNo" }));
    await pick(user, 2, /^Equal$/);
    await pick(user, 3, "Static Value");
    fireEvent.change(screen.getByPlaceholderText("Enter value"), {
      target: { value: "123" },
    });

    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await waitFor(() => expect(onStage).toHaveBeenCalled());
    expect(onStage.mock.calls[0][0].payload.ruleGroup.rules[0]).toMatchObject({
      leftOperand: "AddressInfo.StreetNo",
    });
  });
});

/**
 * These five resets were incidental before the principal selector existed. They are now
 * load-bearing: each one is what stops a compareValue created under a DIFFERENT rule shape from
 * being reinterpreted as a role slug or user id and silently resubmitted into an access policy.
 * They are pinned here so a future refactor cannot quietly remove them.
 */
describe("RuleSetForm — compareValue resets that guard the principal selector", () => {
  const POPOVER_OPEN_LABEL: Record<number, string> = {
    0: "Set Left operand",
    1: "Set Left value",
    2: "Set Operator",
    3: "Set Right operand",
    4: "Set Right value",
  };
  const pick = async (
    user: ReturnType<typeof userEvent.setup>,
    index: number,
    name: RegExp | string,
  ) => {
    const combobox = screen.queryByRole("combobox");
    if (combobox) {
      await user.click(combobox);
    } else if (!screen.queryAllByRole("option").length && POPOVER_OPEN_LABEL[index]) {
      await user.click(screen.getByRole("button", { name: POPOVER_OPEN_LABEL[index] }));
    }
    await user.click(await screen.findByRole("option", { name }));
  };

  const startRule = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<RuleSetForm {...baseProps} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Enter a rule name"), {
      target: { value: "Guards" },
    });
    await user.click(screen.getByRole("button", { name: /Add Rule/ }));
  };

  it("changing the FIELD clears compareValue, so free text cannot reach the selector", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await startRule(user);

    // Build a plain string rule and type free text into it.
    await pick(user, 0, "Products");
    await pick(user, 1, "title");
    await pick(user, 2, /^Equal$/);
    await pick(user, 3, "Static Value");
    fireEvent.change(screen.getByPlaceholderText("Enter value"), {
      target: { value: "not-a-user-id" },
    });

    // Switch the source and field to Auth.UserId: the selector must appear
    // EMPTY, not carrying the old text.
    await user.click(screen.getByTitle("Edit source"));
    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");

    expect(screen.queryByDisplayValue("not-a-user-id")).not.toBeInTheDocument();
    expect(screen.queryByText(/not-a-user-id/)).not.toBeInTheDocument();
  });

  it("crossing the IN boundary clears compareValue, so a multi-value string cannot land in a single-select", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    getRoles.mockResolvedValue({
      data: [
        { itemId: "r-a", name: "Role A", slug: "a", description: "" },
        { itemId: "r-b", name: "Role B", slug: "b", description: "" },
      ],
      totalCount: 2,
      errors: null,
    } as never);
    await startRule(user);

    await pick(user, 0, "Auth");
    await pick(user, 1, "Roles");
    await pick(user, 2, /^In$/);
    await pick(user, 3, "Static Value");
    await user.click(screen.getByRole("button", { name: /Select role/ }));
    await user.click(await screen.findByText("Role A"));
    await user.click(await screen.findByText("Role B"));

    // IN -> CONTAIN crosses the boundary: "a,b" must NOT survive into the single-select, or
    // buildRuleGroup would emit the literal scalar "a,b" as one role slug.
    await user.click(screen.getByTitle("Edit operator"));
    await pick(user, 2, /^Contain$/);

    expect(screen.queryByRole("button", { name: /a, b/ })).not.toBeInTheDocument();
  });

  it("changing the COMPARE SOURCE clears compareValue — the reset that closes the direct-value -> EQUAL path", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await startRule(user);

    // START_WITH takes direct text and hides the compare source entirely.
    // (REGEX would be the same shape but is commented out of RULE_OPERATORS, so it is not
    // reachable in the UI at all - START_WITH is the live form of this hazard.)
    await pick(user, 0, "Auth");
    await pick(user, 1, "UserId");
    await pick(user, 2, /^Start With$/);
    fireEvent.change(screen.getByPlaceholderText("Enter prefix"), {
      target: { value: "admin-prefix" },
    });

    // Reopening the operator chip clears its dependent direct value.
    await user.click(screen.getByTitle("Edit operator"));
    await pick(user, 2, /^Equal$/);
    expect(screen.queryByRole("button", { name: /Select user/ })).not.toBeInTheDocument();

    // Choosing a compare source is the step that wipes the carried direct-value text.
    await pick(user, 3, "Static Value");
    expect(screen.queryByDisplayValue("admin-prefix")).not.toBeInTheDocument();
    expect(screen.queryByText(/admin-prefix/)).not.toBeInTheDocument();
  });
});

/**
 * Hydration bypasses every onValueChange handler, so a persisted rule can land straight in the
 * selector carrying a value that is not a real principal. The contract is preservation: show it,
 * mark it, never rewrite or drop it.
 */
describe("RuleSetForm — hydrated values that are not real principals", () => {
  it("keeps a persisted non-principal userId value verbatim instead of silently dropping it", async () => {
    render(<RuleSetForm {...baseProps} editingPolicy={editingPolicy} />);

    // Fixture rule 0 is auth.userId EQUAL static "abc" - not a real user id.
    expect(await screen.findByRole("button", { name: /abc/ })).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue("My Rule Set");
    fireEvent.change(nameInput, { target: { value: "Renamed again" } });
    const updateBtn = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateBtn).toBeEnabled());
    fireEvent.click(updateBtn);

    await waitFor(() => expect(onStage).toHaveBeenCalled());
    const rules = onStage.mock.calls[0][0].payload.ruleGroup.rules;
    const userIdRule = rules.find((r: { leftOperand: string }) => r.leftOperand === "userId");
    expect(userIdRule.staticValue).toBe("abc");
  });
});

describe("RuleSetForm — footer", () => {
  it("says the rule set saves immediately", async () => {
    render(<RuleSetForm {...baseProps} />);
    expect(screen.getByText("Saves immediately")).toBeInTheDocument();
  });

  it("shows a saving state and disables Save/Cancel while the save is in flight", async () => {
    render(<RuleSetForm {...baseProps} isSubmitting />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  // A toast reporting the parent's save result would sit right on top of
  // this footer's own Save button — the result shows inline here instead.
  it("shows the parent's save result as its own bar above the Save/Cancel row", async () => {
    render(
      <RuleSetForm {...baseProps} status={{ kind: "success", message: "Rule set saved successfully" }} />,
    );
    expect(screen.getByText("Rule set saved successfully")).toBeInTheDocument();
  });

  it("shows a parent save failure inline too", async () => {
    render(<RuleSetForm {...baseProps} status={{ kind: "error", message: "bad" }} />);
    expect(screen.getByText("bad")).toBeInTheDocument();
  });
});
