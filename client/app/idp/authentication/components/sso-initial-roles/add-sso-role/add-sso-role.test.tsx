import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IRole } from "@blocks-idp/iam/models/role";

let rolesData: unknown;
let isLoading = false;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => ({ data: rolesData, isLoading }),
}));

import { AddSSORole } from "./add-sso-role";

const role = (slug: string, name = slug): IRole =>
  ({ itemId: slug, name, slug }) as IRole;

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Assign Role/ }));
  await screen.findByText("Assign roles");
}

beforeEach(() => {
  vi.clearAllMocks();
  isLoading = false;
  rolesData = {
    data: [role("admin", "Admin"), role("existing", "Existing")],
    totalCount: 2,
  };
});

describe("AddSSORole", () => {
  it("lists roles and disables the already-added ones", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddSSORole roles={[role("existing", "Existing")]} onAdd={vi.fn()} />);
    await open(user);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    // Second row corresponds to the already-added "existing" role.
    expect(screen.getAllByRole("checkbox")[1]).toBeDisabled();
  });

  it("shows a placeholder when no roles are found", async () => {
    rolesData = { data: [], totalCount: 0 };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddSSORole roles={[]} onAdd={vi.fn()} />);
    await open(user);
    expect(screen.getByText("No roles are found")).toBeInTheDocument();
  });

  it("calls onAdd with the selected role objects", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AddSSORole roles={[]} onAdd={onAdd} />);
    await open(user);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0]).toEqual([expect.objectContaining({ slug: "admin" })]);
  });
});
