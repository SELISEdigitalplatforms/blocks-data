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
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("./rule-set-form", () => ({ RuleSetForm: () => <div data-testid="rule-set-form" /> }));
vi.mock("./schema-access-control-accordion", () => ({
  SchemaAccessControlAccordion: ({ policies }: { policies?: unknown[] }) => (
    <div data-testid="accordion">policies:{policies?.length ?? 0}</div>
  ),
}));
vi.mock("@/components/confirmation-modal/confirmation-modal", () => ({
  default: ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="confirm-modal">
      <button onClick={onConfirm}>confirm-change</button>
      <button onClick={onCancel}>cancel-change</button>
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
  it("renders the logged-in label for access level 1", () => {
    render(<SchemaAccessControlView {...baseProps} />);
    expect(screen.getByText("All logged in users have access")).toBeInTheDocument();
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
    expect(screen.getByText("All logged in users have access")).toBeInTheDocument();
  });

  it("changes the access type through the confirmation flow and saves", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...baseProps} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Public" }));

    // Confirm dialog wiring is exposed by the mocked modal.
    await user.click(screen.getByText("confirm-change"));
    await waitFor(() =>
      expect(setRowColumnPermission).toHaveBeenCalledWith(
        expect.objectContaining({ accessLevel: 2, schemaId: "schema-1" }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("surfaces an error toast when the access change fails", async () => {
    setRowColumnPermission.mockResolvedValue({ isSuccess: false, errors: ["no"] });
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...baseProps} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Public" }));
    await user.click(screen.getByText("confirm-change"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("cancels an access change without saving", async () => {
    const user = userEvent.setup();
    render(<SchemaAccessControlView {...baseProps} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Public" }));
    await user.click(screen.getByText("cancel-change"));
    expect(setRowColumnPermission).not.toHaveBeenCalled();
  });
});
