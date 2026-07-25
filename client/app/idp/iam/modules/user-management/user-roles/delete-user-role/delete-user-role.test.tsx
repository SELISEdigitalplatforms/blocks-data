import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const deleteRoles = vi.fn();
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useUserRoles: () => ({ deleteRoles, isPending: false }),
}));

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { DeleteUserRole } from "./delete-user-role";

const role = { slug: "admin", name: "Admin" } as never;

const openDialog = async (user: ReturnType<typeof userEvent.setup>, container: HTMLElement) => {
  await user.click(container.querySelector("svg") as SVGElement);
};

afterEach(() => vi.clearAllMocks());

describe("DeleteUserRole", () => {
  it("opens the confirmation dialog from the trigger", async () => {
    const user = userEvent.setup();
    const { container } = render(<DeleteUserRole role={role} userId="u1" projectKey="t1" />);
    await openDialog(user, container);
    expect(await screen.findByText("Exclude Role")).toBeInTheDocument();
  });

  it("excludes the role and shows success", async () => {
    const user = userEvent.setup();
    deleteRoles.mockResolvedValue({ isSuccess: true });
    const { container } = render(<DeleteUserRole role={role} userId="u1" projectKey="t1" />);
    await openDialog(user, container);
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() => expect(deleteRoles).toHaveBeenCalledWith(["admin"]));
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when the exclusion is unsuccessful", async () => {
    const user = userEvent.setup();
    deleteRoles.mockResolvedValue({ isSuccess: false, errors: { role: "bad" } });
    const { container } = render(<DeleteUserRole role={role} userId="u1" projectKey="t1" />);
    await openDialog(user, container);
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { role: "bad" } }));
  });

  it("shows a generic error when the mutation throws", async () => {
    const user = userEvent.setup();
    deleteRoles.mockRejectedValue(new Error("boom"));
    const { container } = render(<DeleteUserRole role={role} userId="u1" projectKey="t1" />);
    await openDialog(user, container);
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }));
  });
});
