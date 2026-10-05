import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetUnadaptedChangeLogs = vi.fn();
const reloadMutateAsync = vi.fn();
const reloadIsPending = { current: false };
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("../../hooks/use-configuration", () => ({
  useGetUnadaptedChangeLogs: () => useGetUnadaptedChangeLogs(),
  useSchemasReload: () => ({
    mutateAsync: reloadMutateAsync,
    isPending: reloadIsPending.current,
  }),
}));

import { PublishControl } from "./publish-control";

describe("PublishControl", () => {
  beforeEach(() => {
    reloadMutateAsync.mockReset();
    showSuccessToast.mockReset();
    showErrorToast.mockReset();
    reloadIsPending.current = false;
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [] } });
  });

  it("counts the waiting changes", () => {
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }, { id: "b" }] } });
    render(<PublishControl />);

    expect(screen.getByText("2 unpublished")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish/ })).toBeInTheDocument();
  });

  // Reloading the gateway is still worth doing with nothing pending, so the
  // control stays clickable — it just stops competing for attention.
  it("stays available but quiet when nothing is pending", async () => {
    const user = userEvent.setup();
    reloadMutateAsync.mockResolvedValue({ isSuccess: true });
    render(<PublishControl />);

    expect(screen.queryByText(/unpublished/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(reloadMutateAsync).toHaveBeenCalled());
  });

  it("reports a successful publish", async () => {
    const user = userEvent.setup();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    reloadMutateAsync.mockResolvedValue({ isSuccess: true });
    render(<PublishControl />);

    await user.click(screen.getByRole("button", { name: /Publish/ }));
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "Schemas published successfully",
      }),
    );
  });

  it("shows a retry after a rejected publish", async () => {
    const user = userEvent.setup();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    reloadMutateAsync.mockRejectedValue(new Error("boom"));
    render(<PublishControl />);

    await user.click(screen.getByRole("button", { name: /Publish/ }));

    expect(await screen.findByText("Publish failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(showErrorToast).toHaveBeenCalled();
  });

  // The API answers 200 with isSuccess:false, which is not an exception.
  it("treats an unsuccessful response as a failure too", async () => {
    const user = userEvent.setup();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    reloadMutateAsync.mockResolvedValue({ isSuccess: false });
    render(<PublishControl />);

    await user.click(screen.getByRole("button", { name: /Publish/ }));

    expect(await screen.findByText("Publish failed")).toBeInTheDocument();
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("locks the button while the reload is in flight", () => {
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    reloadIsPending.current = true;
    render(<PublishControl />);

    expect(screen.getByText("Publishing…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish/ })).toBeDisabled();
  });
});
