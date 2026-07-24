import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const mutateAsync = vi.fn();
let isErr = false;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useAddUser: () => ({ isPending: false, mutateAsync }),
}));

import { InviteUser } from "./invite-user";

async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Invite User/ }));
  await screen.findByText("Invite a new user to the system");
  await user.type(screen.getByPlaceholderText("Enter first name"), "Ada");
  await user.type(screen.getByPlaceholderText("Enter last name"), "Lovelace");
  await user.type(screen.getByPlaceholderText("Enter email"), "ada@example.com");
}

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("InviteUser", () => {
  it("renders the trigger", () => {
    render(<InviteUser />);
    expect(screen.getByRole("button", { name: /Invite User/ })).toBeInTheDocument();
  });

  it("keeps Send disabled until the form is dirty", async () => {
    const user = userEvent.setup();
    render(<InviteUser />);
    await user.click(screen.getByRole("button", { name: /Invite User/ }));
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sends the invitation with the platform defaults and reports success", async () => {
    const user = userEvent.setup();
    render(<InviteUser />);
    await openAndFill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      userPassType: 1,
      userCreationType: 1,
      platform: "blocks_portal",
      projectKey: "tenant-abc",
    });
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "Invitation is sent" });
  });

  it("shows an error toast when the invite is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<InviteUser />);
    await openAndFill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });

  it("maps a thrown error with an errors field", async () => {
    isErr = true;
    mutateAsync.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    render(<InviteUser />);
    await openAndFill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });
});
