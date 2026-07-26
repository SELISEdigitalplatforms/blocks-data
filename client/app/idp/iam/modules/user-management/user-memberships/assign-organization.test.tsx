import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const updateUser = vi.fn();
let isErr = false;
let userData: unknown;
let orgsData: unknown;
let rolesData: unknown;
let isPending = false;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({
  isErrorWithErrors: () => isErr,
}));
vi.mock("@blocks-idp/iam/hooks/use-organization", () => ({
  useGetOrganizations: () => ({ data: orgsData, isLoading: false }),
}));
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => ({ data: rolesData, isLoading: false }),
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData }),
  useUpdateUser: () => ({ mutateAsync: updateUser, isPending }),
}));

import { AssignOrganization } from "./assign-organization";

// Radix Select / cmdk rely on pointer-capture and scrollIntoView APIs jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  isPending = false;
  userData = { data: { memberships: [{ organizationId: "org-existing" }], itemId: "user-1" } };
  orgsData = {
    organizations: [
      { itemId: "org-1", name: "Alpha Org", isEnable: true },
      { itemId: "org-existing", name: "Already", isEnable: true },
      { itemId: "org-disabled", name: "Disabled", isEnable: false },
    ],
  };
  rolesData = {
    data: [
      { name: "Admin", slug: "admin" },
      { name: "Viewer", slug: "viewer" },
    ],
  };
  updateUser.mockResolvedValue({ isSuccess: true });
});

const props = { userId: "user-1", projectKey: "tenant-1" };

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Assign/ }));
  await screen.findByText("Assign organization");
}

// Before either popover opens the DOM has exactly two comboboxes: the Radix
// Select trigger for the organization (first) and the role popover trigger
// (second). Index by DOM order rather than accessible name because the Radix
// trigger exposes no name and the role trigger's label changes once a role is
// picked.
const orgTrigger = () => screen.getAllByRole("combobox")[0];
const roleTrigger = () => screen.getAllByRole("combobox")[1];

async function selectOrg(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(orgTrigger());
  await user.click(await screen.findByRole("option", { name }));
}

async function selectRole(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(roleTrigger());
  await user.click(await screen.findByRole("option", { name }));
}

describe("AssignOrganization", () => {
  it("renders the Assign trigger", () => {
    render(<AssignOrganization {...props} />);
    expect(screen.getByRole("button", { name: /Assign/ })).toBeInTheDocument();
  });

  it("opens the dialog and lists only enabled, unassigned organizations", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    await user.click(orgTrigger());
    const options = await screen.findAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Alpha Org");
    expect(labels).not.toContain("Already");
    expect(labels).not.toContain("Disabled");
  });

  it("keeps Confirm disabled until an organization and a role are chosen", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("selects an organization and a role then confirms successfully", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);

    await selectOrg(user, "Alpha Org");
    await selectRole(user, "Admin");

    const confirm = screen.getByRole("button", { name: "Confirm" });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    const payload = updateUser.mock.calls[0][0];
    expect(payload.memberships).toEqual([
      { organizationId: "org-existing" },
      { organizationId: "org-1", roles: ["admin"], permissions: [] },
    ]);
    expect(payload.itemId).toBe("user-1");
    expect(payload.projectKey).toBe("tenant-1");
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("closes the dialog after a successful confirm", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    await selectOrg(user, "Alpha Org");
    await selectRole(user, "Admin");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.queryByText("Assign organization")).not.toBeInTheDocument(),
    );
  });

  it("shows an error toast when the update responds unsuccessful", async () => {
    updateUser.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    await selectOrg(user, "Alpha Org");
    await selectRole(user, "Viewer");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("maps a thrown error with an errors field through the toast", async () => {
    isErr = true;
    updateUser.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    await selectOrg(user, "Alpha Org");
    await selectRole(user, "Admin");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });

  it("falls back to a generic error when a thrown error has no errors field", async () => {
    isErr = false;
    updateUser.mockRejectedValue(new Error("network"));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    await selectOrg(user, "Alpha Org");
    await selectRole(user, "Admin");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
  });

  it("toggles a role off when selected twice, re-disabling Confirm", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    await selectOrg(user, "Alpha Org");
    // The popover stays open after a selection, so the same option can be clicked again to deselect.
    await user.click(roleTrigger());
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("shows the count badge when more than two roles are selected", async () => {
    rolesData = {
      data: [
        { name: "Admin", slug: "admin" },
        { name: "Viewer", slug: "viewer" },
        { name: "Editor", slug: "editor" },
      ],
    };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    await user.click(roleTrigger());
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    await user.click(await screen.findByRole("option", { name: "Viewer" }));
    await user.click(await screen.findByRole("option", { name: "Editor" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("renders a disabled placeholder when no roles are available", async () => {
    rolesData = { data: [] };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    expect(screen.getByText("No roles available")).toBeInTheDocument();
  });

  it("resets selections when the dialog is cancelled", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AssignOrganization {...props} />);
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Assign organization")).not.toBeInTheDocument(),
    );
  });
});
