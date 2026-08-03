import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const addPermissions = vi.fn();
let isErr = false;
let permData: unknown;
let assignedResources: string[] = [];

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissions: () => ({ data: permData, isLoading: false }),
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useUserPermissions: () => ({ isPending: false, addPermissions, resources: assignedResources }),
}));

import { AddUserPermission } from "./add-user-permission";

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Assign Permissions/ }));
  await screen.findByText("Include Permissions");
}

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  assignedResources = [];
  permData = {
    data: [
      { itemId: "1", name: "Read Users", resource: "users:read", type: 0 },
      { itemId: "2", name: "Write Users", resource: "users:write", type: 0 },
    ],
    totalCount: 2,
  };
  addPermissions.mockResolvedValue({ isSuccess: true });
});

describe("AddUserPermission", () => {
  it("renders the trigger", () => {
    render(<AddUserPermission userId="u1" projectKey="t1" />);
    expect(screen.getByRole("button", { name: /Assign Permissions/ })).toBeInTheDocument();
  });

  it("disables the trigger when five permissions are already assigned", () => {
    assignedResources = ["a", "b", "c", "d", "e"];
    render(<AddUserPermission userId="u1" projectKey="t1" />);
    expect(screen.getByRole("button", { name: /Assign Permissions/ })).toBeDisabled();
  });

  it("lists permissions with their names", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserPermission userId="u1" projectKey="t1" />);
    await open(user);
    expect(screen.getByText("Read Users")).toBeInTheDocument();
    expect(screen.getByText("Write Users")).toBeInTheDocument();
  });

  it("keeps Include disabled until a permission is selected", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserPermission userId="u1" projectKey="t1" />);
    await open(user);
    expect(screen.getByRole("button", { name: "Include" })).toBeDisabled();
  });

  it("adds the selected permission and reports success", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserPermission userId="u1" projectKey="t1" />);
    await open(user);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Include" }));
    await waitFor(() => expect(addPermissions).toHaveBeenCalledWith(["users:read"]));
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "New permission added" });
  });

  it("shows an error toast when the add is unsuccessful", async () => {
    addPermissions.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddUserPermission userId="u1" projectKey="t1" />);
    await open(user);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Include" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });
});
