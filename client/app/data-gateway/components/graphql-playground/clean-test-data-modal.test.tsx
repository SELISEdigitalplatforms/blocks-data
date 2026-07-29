import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetMockData = vi.fn();
const deleteMockData = vi.fn();
const refetch = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useGetMockData: () => useGetMockData(),
  useDeleteMockData: () => ({ mutateAsync: deleteMockData, isPending: false }),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { CleanTestDataModal } from "./clean-test-data-modal";

function renderModal() {
  const onOpenChange = vi.fn();
  render(<CleanTestDataModal open onOpenChange={onOpenChange} />);
  return { onOpenChange };
}

describe("CleanTestDataModal", () => {
  beforeEach(() => {
    useGetMockData.mockReset();
    deleteMockData.mockReset();
    refetch.mockReset();
    showSuccessToast.mockReset();
    showErrorToast.mockReset();
  });

  it("shows the empty state when there is no test data", () => {
    useGetMockData.mockReturnValue({ data: { data: { items: [] } }, isLoading: false, refetch });
    renderModal();
    expect(screen.getByText("No test data found")).toBeInTheDocument();
  });

  it("renders schema rows with record counts and a disabled Delete", () => {
    useGetMockData.mockReturnValue({
      data: { data: { items: [{ schemaName: "User", collectionName: "sb_Users", count: 3 }] } },
      isLoading: false,
      refetch,
    });
    renderModal();

    expect(screen.getByText("sb_Users")).toBeInTheDocument();
    expect(screen.getByText("(3 records)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("selects all and deletes the selected schemas", async () => {
    const user = userEvent.setup();
    useGetMockData.mockReturnValue({
      data: { data: { items: [{ schemaName: "User", collectionName: "sb_Users", count: 3 }] } },
      isLoading: false,
      refetch,
    });
    deleteMockData.mockResolvedValue({ isSuccess: true });
    const { onOpenChange } = renderModal();

    await user.click(screen.getByText(/Select All/));
    const del = screen.getByRole("button", { name: "Delete" });
    await waitFor(() => expect(del).toBeEnabled());
    await user.click(del);

    await waitFor(() =>
      expect(deleteMockData).toHaveBeenCalledWith({
        projectKey: "t1",
        schemaNames: ["User"],
      }),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("refetches mock data when it opens", () => {
    useGetMockData.mockReturnValue({ data: { data: { items: [] } }, isLoading: false, refetch });
    renderModal();
    expect(refetch).toHaveBeenCalled();
  });
});
