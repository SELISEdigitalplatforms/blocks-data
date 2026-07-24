import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const addRoles = vi.fn();
let isErr = false;
let rolesData: unknown;
let isLoading = false;
let assignedSlugs: string[] = [];

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => ({ data: rolesData, isLoading }),
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useUserRoles: () => ({ isPending: false, addRoles, slugs: assignedSlugs }),
}));

import { AddUserRole } from "./add-user-role";

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Assign Role"));
  await screen.findByText("Assign roles");
}

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  isLoading = false;
  assignedSlugs = ["existing"];
  rolesData = {
    data: [
      { itemId: "1", name: "Admin", slug: "admin" },
      { itemId: "2", name: "Existing", slug: "existing" },
    ],
    totalCount: 2,
  };
  addRoles.mockResolvedValue({ isSuccess: true });
});

describe("AddUserRole", () => {
  it("renders the trigger", () => {
    render(<AddUserRole userId="u1" projectKey="t1" />);
    expect(screen.getByText("Assign Role")).toBeInTheDocument();
  });

  it("lists available roles and disables already-assigned ones", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserRole userId="u1" projectKey="t1" />);
    await open(user);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    // Second row is the already-assigned "existing" role.
    expect(boxes[1]).toBeDisabled();
  });

  it("shows a placeholder when no roles are found", async () => {
    rolesData = { data: [], totalCount: 0 };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserRole userId="u1" projectKey="t1" />);
    await open(user);
    expect(screen.getByText("No roles found")).toBeInTheDocument();
  });

  it("keeps Include disabled until a role is selected", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserRole userId="u1" projectKey="t1" />);
    await open(user);
    expect(screen.getByRole("button", { name: "Include" })).toBeDisabled();
  });

  it("assigns the selected roles and reports success", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserRole userId="u1" projectKey="t1" />);
    await open(user);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Include" }));
    await waitFor(() => expect(addRoles).toHaveBeenCalledWith(["admin"]));
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "New role assigned successfully" });
  });

  it("shows an error toast when the assignment is unsuccessful", async () => {
    addRoles.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserRole userId="u1" projectKey="t1" />);
    await open(user);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Include" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });
});
