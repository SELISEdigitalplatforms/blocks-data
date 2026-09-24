import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const useGetPolicyData = vi.fn();
const setRowColumnPermission = vi.fn();
const refetch = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useGetPolicyData: (...a: unknown[]) => useGetPolicyData(...a),
  useSetRowColumnPermission: () => ({ mutateAsync: setRowColumnPermission, isPending: false }),
}));
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("./rule-set-form", () => ({
  RuleSetForm: ({
    onCancel,
    seed,
  }: {
    onCancel?: () => void;
    seed?: { name: string };
  }) => (
    <div data-testid="rule-set-form">
      <span data-testid="seed-name">{seed?.name ?? "none"}</span>
      <button onClick={() => onCancel?.()}>rsf-cancel</button>
    </div>
  ),
}));
vi.mock("./schema-access-control-accordion", () => ({
  SchemaAccessControlAccordion: ({
    policies,
    onAddRuleSet,
    onEditPolicy,
  }: {
    policies?: unknown[];
    onAddRuleSet?: () => void;
    onEditPolicy?: (p: unknown) => void;
  }) => (
    <div data-testid="accordion">
      policies:{policies?.length ?? 0}
      <button onClick={() => onAddRuleSet?.()}>add-rule</button>
      <button onClick={() => onEditPolicy?.({ itemId: "e1" })}>edit-policy</button>
    </div>
  ),
}));
import { SchemaAccessControlView } from "./schema-access-control-view";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const baseProps = {
  schemaFields: [],
  schemaName: "Products",
  schemaId: "schema-1",
  level: "row" as const,
  operation: 0,
  fieldNames: [] as string[],
  defaultAccessLevel: 1,
};

const policy = (over: Record<string, unknown> = {}) => ({
  itemId: "p1",
  operation: 0,
  fieldNames: [],
  policyName: "P",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  useGetPolicyData.mockReturnValue({
    data: { isSuccess: true, data: [] },
    refetch,
    isPending: false,
    isFetching: false,
  });
  setRowColumnPermission.mockResolvedValue({ isSuccess: true });
});

describe("SchemaAccessControlView", () => {
  // The header used to state the tier — "All logged in users have access" —
  // leaving the reader to work out what that meant for this verb on this schema.
  it("spells out the effect of signed-in access for this verb", () => {
    render(<SchemaAccessControlView {...baseProps} />);
    expect(
      screen.getByText(
        "Any signed-in user in this project can read Products, with no further checks.",
      ),
    ).toBeInTheDocument();
    // Not custom, so no accordion / rule form.
    expect(screen.queryByTestId("accordion")).not.toBeInTheDocument();
  });

  it("renders the custom accordion with filtered policies for access level 3", () => {
    useGetPolicyData.mockReturnValue({
      data: { isSuccess: true, data: [policy(), policy({ itemId: "p2", operation: 1 })] },
      refetch,
      isPending: false,
      isFetching: false,
    });
    render(<SchemaAccessControlView {...baseProps} defaultAccessLevel={3} />);
    // Only the operation-0 row-level policy passes the filter.
    expect(screen.getByTestId("accordion")).toHaveTextContent("policies:1");
  });

  it("shows the loading state for custom access while the policy list is pending", () => {
    useGetPolicyData.mockReturnValue({
      data: undefined,
      refetch,
      isPending: true,
      isFetching: true,
    });
    render(<SchemaAccessControlView {...baseProps} defaultAccessLevel={3} />);
    expect(screen.getByText("Loading access rules…")).toBeInTheDocument();
  });

  it("infers custom access when the default level is unknown but policies exist", () => {
    useGetPolicyData.mockReturnValue({
      data: { isSuccess: true, data: [policy()] },
      refetch,
      isPending: false,
      isFetching: false,
    });
    render(<SchemaAccessControlView {...baseProps} defaultAccessLevel={undefined} />);
    expect(screen.getByTestId("accordion")).toBeInTheDocument();
  });

  it("infers logged-in access when the default level is unknown and no policies exist", () => {
    render(<SchemaAccessControlView {...baseProps} defaultAccessLevel={undefined} />);
    expect(screen.getByText(/Any signed-in user in this project can read Products/))
      .toBeInTheDocument();
  });

  it("changes the access type through the deferred Save and saves", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...baseProps} />);

    // Picking a tile is local only, and the footer reflects the pending change.
    await user.click(screen.getByRole("radio", { name: "Public" }));
    expect(screen.getByText("Unsaved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setRowColumnPermission).toHaveBeenCalledWith(
        expect.objectContaining({ accessLevel: 2, schemaId: "schema-1" }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("No changes")).toBeInTheDocument());
  });

  it("surfaces an error toast when the access change fails", async () => {
    setRowColumnPermission.mockResolvedValue({ isSuccess: false, errors: ["no"] });
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...baseProps} />);
    await user.click(screen.getByRole("radio", { name: "Public" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("cancels an access change without saving", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...baseProps} />);
    await user.click(screen.getByRole("radio", { name: "Public" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setRowColumnPermission).not.toHaveBeenCalled();
    // Reverted back to the last saved tier (Signed-in).
    expect(screen.getByRole("radio", { name: "Signed-in" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("No changes")).toBeInTheDocument();
  });

  it("filters column-level policies by matching field names", () => {
    useGetPolicyData.mockReturnValue({
      data: {
        isSuccess: true,
        data: [
          policy({ itemId: "match", fieldNames: ["email"] }),
          policy({ itemId: "other", fieldNames: ["name"] }),
          policy({ itemId: "rowlevel", fieldNames: [] }),
        ],
      },
      refetch,
      isPending: false,
      isFetching: false,
    });
    render(
      <SchemaAccessControlView
        {...baseProps}
        level="column"
        fieldNames={["email"]}
        defaultAccessLevel={3}
      />,
    );
    expect(screen.getByTestId("accordion")).toHaveTextContent("policies:1");
  });

  it("ignores an unmapped default access level", () => {
    render(<SchemaAccessControlView {...baseProps} defaultAccessLevel={99} />);
    expect(
      screen.getByText(/Any signed-in user in this project can read Products/),
    ).toBeInTheDocument();
  });

  it("waits for the policy response before inferring the access type", () => {
    useGetPolicyData.mockReturnValue({
      data: undefined,
      refetch,
      isPending: false,
      isFetching: false,
    });
    render(<SchemaAccessControlView {...baseProps} defaultAccessLevel={undefined} />);
    expect(
      screen.getByText(/Any signed-in user in this project can read Products/),
    ).toBeInTheDocument();
  });

  it("opens the rule-set form and refetches after a successful save", async () => {
    const user = userEvent.setup();
    useGetPolicyData.mockReturnValue({
      data: { isSuccess: true, data: [policy()] },
      refetch,
      isPending: false,
      isFetching: false,
    });
    render(<SchemaAccessControlView {...baseProps} defaultAccessLevel={3} />);

    await user.click(screen.getByText("add-rule"));
    expect(screen.getByTestId("rule-set-form")).toBeInTheDocument();

    await user.click(screen.getByText("rsf-cancel"));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(screen.queryByTestId("rule-set-form")).not.toBeInTheDocument();
  });

  it("opens the rule-set form to edit an existing policy", async () => {
    const user = userEvent.setup();
    useGetPolicyData.mockReturnValue({
      data: { isSuccess: true, data: [policy()] },
      refetch,
      isPending: false,
      isFetching: false,
    });
    render(<SchemaAccessControlView {...baseProps} defaultAccessLevel={3} />);

    await user.click(screen.getByText("edit-policy"));
    expect(screen.getByTestId("rule-set-form")).toBeInTheDocument();
  });

  it("orders the who-is-allowed tiles as Public, Signed-in, Custom", () => {
    render(<SchemaAccessControlView {...baseProps} level="row" />);
    const tiles = screen.getAllByRole("radio").map((el) => el.textContent);
    expect(tiles).toEqual(["Public", "Signed-in", "Custom"]);
  });

  it("hides the Inherited tile at row level, since there is nothing to inherit from", () => {
    render(<SchemaAccessControlView {...baseProps} level="row" />);
    expect(screen.queryByRole("radio", { name: "Inherited" })).not.toBeInTheDocument();
  });

  it("offers the Inherited tile at column level", () => {
    render(<SchemaAccessControlView {...baseProps} level="column" />);
    expect(screen.getByRole("radio", { name: "Inherited" })).toBeInTheDocument();
  });

  it("shows the rule-set section as soon as Custom is picked, before it is saved", async () => {
    useGetPolicyData.mockReturnValue({
      data: { isSuccess: true, data: [policy()] },
      refetch,
      isPending: false,
      isFetching: false,
    });
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...baseProps} />);
    expect(screen.queryByTestId("accordion")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Custom" }));
    expect(await screen.findByTestId("accordion")).toBeInTheDocument();
    expect(setRowColumnPermission).not.toHaveBeenCalled();
  });

  it("surfaces an error toast when the access change throws", async () => {
    setRowColumnPermission.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...baseProps} />);
    await user.click(screen.getByRole("radio", { name: "Public" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: expect.any(Error) }),
    );
  });

  // ── Phase 5: presets and the empty custom policy ────────────────────────

  const customProps = {
    ...baseProps,
    defaultAccessLevel: 3,
    schemaFields: [{ name: "OwnerId" }, { name: "Status" }] as never,
  };

  // Custom with nothing in it looks configured and grants nothing.
  it("warns that an empty custom policy allows nobody", () => {
    render(<SchemaAccessControlView {...customProps} />);

    expect(
      screen.getByText("A custom policy with no rule sets allows nobody to read Products."),
    ).toBeInTheDocument();
  });

  /**
   * The panel warned that an empty Custom policy allows nobody, then let the
   * tier footer save exactly that — locking the schema out in one click. The
   * tier is now only committed once a rule set gives it meaning.
   */
  describe("Custom with no rule sets", () => {
    it("refuses to save the tier on its own, and says why", async () => {
      const user = userEvent.setup();
      render(<SchemaAccessControlView {...baseProps} />);

      await user.click(screen.getByRole("radio", { name: "Custom" }));

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByText("Add a rule set to save Custom")).toBeInTheDocument();
      expect(setRowColumnPermission).not.toHaveBeenCalled();
    });

    // Cancel is the way back out, so it must stay live.
    it("still allows reverting the selection", async () => {
      const user = userEvent.setup();
      render(<SchemaAccessControlView {...baseProps} />);

      await user.click(screen.getByRole("radio", { name: "Custom" }));
      const cancel = screen.getByRole("button", { name: "Cancel" });
      expect(cancel).toBeEnabled();

      await user.click(cancel);
      expect(screen.getByRole("radio", { name: "Signed-in" })).toBeChecked();
    });

    it("permits the save once a rule set exists", async () => {
      useGetPolicyData.mockReturnValue({
        data: { isSuccess: true, data: [policy()] },
        refetch,
        isPending: false,
        isFetching: false,
      });
      const user = userEvent.setup();
      render(<SchemaAccessControlView {...baseProps} />);

      await user.click(screen.getByRole("radio", { name: "Custom" }));

      const save = screen.getByRole("button", { name: "Save" });
      expect(save).toBeEnabled();
      await user.click(save);
      await waitFor(() => expect(setRowColumnPermission).toHaveBeenCalled());
    });

    // An in-flight policy list is also empty; disabling on that would flicker
    // the button for every Custom schema on open.
    it("does not gate on a policy list that is still loading", async () => {
      useGetPolicyData.mockReturnValue({
        data: undefined,
        refetch,
        isPending: true,
        isFetching: true,
      });
      const user = userEvent.setup();
      render(<SchemaAccessControlView {...baseProps} />);

      await user.click(screen.getByRole("radio", { name: "Custom" }));
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    // Tiers that mean something on their own are unaffected.
    it("leaves Public and Signed-in saveable", async () => {
      const user = userEvent.setup();
      render(<SchemaAccessControlView {...baseProps} />);

      await user.click(screen.getByRole("radio", { name: "Public" }));
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
  });

  it("offers presets instead of an empty rule-set table, under a Sample rule set heading", () => {
    render(<SchemaAccessControlView {...customProps} />);

    expect(screen.getByText("Sample rule set")).toBeInTheDocument();
    expect(screen.getByText("Only the owner")).toBeInTheDocument();
    expect(screen.getByText("Specific roles")).toBeInTheDocument();
    expect(screen.queryByTestId("accordion")).not.toBeInTheDocument();
  });

  // A preset fills the form rather than saving, so its rules are read first.
  it("seeds the form from a preset rather than saving it", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...customProps} />);

    await user.click(screen.getByText("Only the owner"));

    expect(screen.getByTestId("rule-set-form")).toBeInTheDocument();
    expect(screen.getByTestId("seed-name")).toHaveTextContent("Owner access");
  });

  // The rule editor used to replace the whole "who is allowed" section,
  // hiding the Custom tile the user had just picked. It should stay put, with
  // the editor appearing right under it — for a preset and for a blank rule alike.
  it("keeps the who-is-allowed tiles visible (but locked) under Custom while editing a rule set", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...customProps} />);

    await user.click(screen.getByText("Only the owner"));
    expect(screen.getByTestId("rule-set-form")).toBeInTheDocument();
    const customTile = screen.getByRole("radio", { name: "Custom" });
    expect(customTile).toBeInTheDocument();
    expect(customTile).toHaveAttribute("aria-checked", "true");
    expect(customTile).toBeDisabled();
  });

  it("keeps the tiles visible the same way for a blank rule set", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...customProps} />);

    await user.click(screen.getByText("Start from an empty rule set"));
    expect(screen.getByTestId("rule-set-form")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Custom" })).toBeDisabled();
  });

  it("starts an empty rule set with no seed", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...customProps} />);

    await user.click(screen.getByText("Start from an empty rule set"));
    expect(screen.getByTestId("seed-name")).toHaveTextContent("none");
  });

  // The override preset is two sets and the form holds one, so the second is
  // seeded the moment the first lands.
  it("seeds the second set of a two-set preset after the first saves", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...customProps} />);

    await user.click(screen.getByText("Owner, plus a support override"));
    expect(screen.getByTestId("seed-name")).toHaveTextContent("Owner access");

    await user.click(screen.getByText("rsf-cancel"));

    expect(screen.getByTestId("rule-set-form")).toBeInTheDocument();
    expect(screen.getByTestId("seed-name")).toHaveTextContent("Support override");
  });

  it("closes the form once a single-set preset is saved", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...customProps} />);

    await user.click(screen.getByText("Only the owner"));
    await user.click(screen.getByText("rsf-cancel"));

    expect(screen.queryByTestId("rule-set-form")).not.toBeInTheDocument();
  });
});
