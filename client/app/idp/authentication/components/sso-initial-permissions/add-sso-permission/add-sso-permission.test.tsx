import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPermission } from "@blocks-idp/iam/models/permission";

let permData: unknown;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissions: () => ({ data: permData, isLoading: false }),
}));

import { AddSSOPermission } from "./add-sso-permission";

const perm = (resource: string, name = resource): IPermission =>
  ({ itemId: resource, name, resource, type: 0 }) as IPermission;

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Assign Permissions/ }));
  await screen.findByText(/You can select up to 5 permissions/);
}

beforeEach(() => {
  vi.clearAllMocks();
  permData = {
    data: [perm("users:read", "Read"), perm("users:write", "Write")],
    totalCount: 2,
  };
});

describe("AddSSOPermission", () => {
  it("disables the trigger when five permissions are already added", () => {
    render(
      <AddSSOPermission
        permissions={["a", "b", "c", "d", "e"].map((r) => perm(r))}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Assign Permissions/ })).toBeDisabled();
  });

  it("lists permissions and updates the counter on selection", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddSSOPermission permissions={[]} onAdd={vi.fn()} />);
    await open(user);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("(0/5)")).toBeInTheDocument();
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("(1/5)")).toBeInTheDocument();
  });

  it("keeps Add disabled until a permission is selected", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddSSOPermission permissions={[]} onAdd={vi.fn()} />);
    await open(user);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("calls onAdd with the selected permission objects", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddSSOPermission permissions={[]} onAdd={onAdd} />);
    await open(user);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0]).toEqual([
      expect.objectContaining({ resource: "users:read" }),
    ]);
  });
});
