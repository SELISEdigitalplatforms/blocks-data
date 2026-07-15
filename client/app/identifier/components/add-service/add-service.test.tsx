import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mutateAsync, showErrorToast, showSuccessToast } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/identifier/hooks/use-services", () => ({
  useRegisterService: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast,
  showSuccessToast,
}));

import { AddService } from "./add-service";

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /register service/i }));
  await screen.findByText("Register New Service");
}

describe("AddService", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
  });

  it("opens the registration dialog from the trigger", async () => {
    const user = userEvent.setup();
    render(<AddService />);
    await openDialog(user);
    expect(screen.getByText("Register a new service to start collecting logs and traces.")).toBeInTheDocument();
  });

  it("registers the service and shows a success toast on success", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const user = userEvent.setup();
    render(<AddService />);
    await openDialog(user);

    await user.type(screen.getByPlaceholderText("Enter name"), "Auth API");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ serviceName: "Auth API", serviceType: "frontend" }),
    );
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "Service Registered successfully",
      }),
    );
  });

  it("surfaces an error toast when registration reports failure", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "Boom" });
    const user = userEvent.setup();
    render(<AddService />);
    await openDialog(user);

    await user.type(screen.getByPlaceholderText("Enter name"), "Auth API");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "Boom" }));
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("keeps Save disabled until the form is dirty", async () => {
    const user = userEvent.setup();
    render(<AddService />);
    await openDialog(user);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});
