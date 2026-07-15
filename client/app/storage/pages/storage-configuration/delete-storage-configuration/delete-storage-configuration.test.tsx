import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IStorageConfiguration } from "@/storage/models/storage.model";

const { mutateAsync, showErrorToast, showSuccessToast } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/storage/hooks/use-storage-configuration", () => ({
  useDeleteStorageConfiguration: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({ showErrorToast, showSuccessToast }));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-123" } }),
}));

import { DeleteStorageConfiguration } from "./delete-storage-configuration";

const configuration = { name: "prod-bucket" } as IStorageConfiguration;

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /delete/i }));
  await screen.findByText("Delete Configuration");
}

describe("DeleteStorageConfiguration", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
  });

  it("opens the confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<DeleteStorageConfiguration configuration={configuration} />);
    await openDialog(user);
    expect(
      screen.getByText(/Are you sure you want to delete this storage configuration/i),
    ).toBeInTheDocument();
  });

  it("deletes with the tenant key and configuration name, then shows success", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const user = userEvent.setup();
    render(<DeleteStorageConfiguration configuration={configuration} />);
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectKey: "tenant-123",
        configurationName: "prod-bucket",
      }),
    );
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({ description: "Configuration deleted" }),
    );
  });

  it("shows an error toast when deletion is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "nope" });
    const user = userEvent.setup();
    render(<DeleteStorageConfiguration configuration={configuration} />);
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "nope" }));
    expect(showSuccessToast).not.toHaveBeenCalled();
  });
});
