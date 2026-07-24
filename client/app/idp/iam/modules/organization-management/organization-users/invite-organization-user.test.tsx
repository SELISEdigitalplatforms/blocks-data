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

import { InviteOrganizationUser } from "./invite-organization-user";

async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Invite User/ }));
  await screen.findByText("Invite a new user to the organization");
  await user.type(screen.getByPlaceholderText("Enter first name"), "Ada");
  await user.type(screen.getByPlaceholderText("Enter last name"), "Lovelace");
  await user.type(screen.getByPlaceholderText("Enter email"), "ada@example.com");
}

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("InviteOrganizationUser", () => {
  it("renders the trigger", () => {
    render(<InviteOrganizationUser organizationId="org-1" />);
    expect(screen.getByRole("button", { name: /Invite User/ })).toBeInTheDocument();
  });

  it("sends the invitation scoped to the organization", async () => {
    const user = userEvent.setup();
    render(<InviteOrganizationUser organizationId="org-9" />);
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
      organizationId: "org-9",
    });
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "Invitation is sent" });
  });

  it("shows an error toast when the invite is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<InviteOrganizationUser organizationId="org-9" />);
    await openAndFill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });

  it("maps a thrown error with an errors field", async () => {
    isErr = true;
    mutateAsync.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    render(<InviteOrganizationUser organizationId="org-9" />);
    await openAndFill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });
});
