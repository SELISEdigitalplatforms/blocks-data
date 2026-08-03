import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deletePolicy = vi.fn();
vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useDeletePolicy: () => ({ mutateAsync: deletePolicy, isPending: false }),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

import { SchemaAccessControlAccordion } from "./schema-access-control-accordion";

const policy = {
  itemId: "p1",
  policyName: "Admins only",
  fieldNames: [],
  operation: 1,
  ruleGroup: {
    logicalOperator: 0,
    rules: [
      {
        leftSource: 0,
        leftOperand: "userId",
        operator: 0,
        rightSource: 2,
        rightOperand: "",
        staticValue: "abc",
      },
    ],
  },
} as unknown as Parameters<typeof SchemaAccessControlAccordion>[0]["policies"] extends
  | (infer T)[]
  | undefined
  ? T
  : never;

describe("SchemaAccessControlAccordion", () => {
  beforeEach(() => {
    deletePolicy.mockReset();
  });

  it("renders the empty message and Add control when there are no policies", async () => {
    const user = userEvent.setup();
    const onAddRuleSet = vi.fn();
    render(<SchemaAccessControlAccordion policies={[]} onAddRuleSet={onAddRuleSet} />);

    expect(
      screen.getByText(/No rule sets added yet/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add/ }));
    expect(onAddRuleSet).toHaveBeenCalled();
  });

  it("renders a row per policy with its rule count", () => {
    render(<SchemaAccessControlAccordion policies={[policy]} />);
    expect(screen.getByText("Admins only")).toBeInTheDocument();
    // rulesCount cell
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("expands a policy row to show the readable rule text", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlAccordion policies={[policy]} />);

    await user.click(screen.getByText("Admins only"));
    expect(screen.getByText("All rules match (AND)")).toBeInTheDocument();
    // ruleToText renders the left operand somewhere in the rule text
    expect(screen.getByText(/userId/)).toBeInTheDocument();
  });

  it("filters policies by the search box", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlAccordion policies={[policy]} />);

    await user.type(screen.getByPlaceholderText("Search"), "zzz");
    expect(screen.getByText(/No rule sets match "zzz"/)).toBeInTheDocument();
    expect(screen.queryByText("Admins only")).not.toBeInTheDocument();
  });

  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    // The row menu trigger is the icon-only button (no text) in the row.
    const trigger = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg") && !b.textContent?.trim())!;
    await user.click(trigger);
  };

  it("edits a policy from the row menu", async () => {
    const user = userEvent.setup();
    const onEditPolicy = vi.fn();
    render(
      <SchemaAccessControlAccordion policies={[policy]} onEditPolicy={onEditPolicy} />,
    );

    await openRowMenu(user);
    await user.click(await screen.findByText("Edit"));
    expect(onEditPolicy).toHaveBeenCalledWith(policy);
  });

  it("deletes a policy after confirmation", async () => {
    const user = userEvent.setup();
    deletePolicy.mockResolvedValue({ isSuccess: true });
    render(<SchemaAccessControlAccordion policies={[policy]} />);

    await openRowMenu(user);
    await user.click(await screen.findByText("Delete"));
    expect(await screen.findByText("Delete rule set?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deletePolicy).toHaveBeenCalledWith({
        itemId: "p1",
        projectKey: "t1",
      }),
    );
  });

  it("handles a failed policy deletion", async () => {
    const user = userEvent.setup();
    deletePolicy.mockResolvedValue({ isSuccess: false, errors: ["no"] });
    render(<SchemaAccessControlAccordion policies={[policy]} />);

    await openRowMenu(user);
    await user.click(await screen.findByText("Delete"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deletePolicy).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText("Delete rule set?")).not.toBeInTheDocument(),
    );
  });

  it("handles a thrown error during policy deletion", async () => {
    const user = userEvent.setup();
    deletePolicy.mockRejectedValue(new Error("boom"));
    render(<SchemaAccessControlAccordion policies={[policy]} />);

    await openRowMenu(user);
    await user.click(await screen.findByText("Delete"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deletePolicy).toHaveBeenCalled());
  });

  it("dismisses the delete confirmation without deleting", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlAccordion policies={[policy]} />);

    await openRowMenu(user);
    await user.click(await screen.findByText("Delete"));
    expect(await screen.findByText("Delete rule set?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Delete rule set?")).not.toBeInTheDocument(),
    );
    expect(deletePolicy).not.toHaveBeenCalled();
  });
});
