import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  policies: [] as unknown[],
  grant: vi.fn(),
  revoke: vi.fn(),
  toggleInheritance: vi.fn(),
  updateDirectory: vi.fn(),
  updateFile: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  users: [] as { value: string; label: string; description?: string }[],
  roles: [] as { value: string; label: string; description?: string }[],
  organizations: [] as { value: string; label: string; description?: string }[],
  directoryDetail: undefined as { objectAccessLevel?: string } | undefined,
  fileDetail: undefined as { objectAccessLevel?: string } | undefined,
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: mocks.showSuccessToast,
  showErrorToast: mocks.showErrorToast,
  showInfoToast: vi.fn(),
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../../hooks/use-dms", () => ({
  useAccessPolicies: () => ({ data: mocks.policies, isLoading: false }),
  useGrantAccess: () => ({ mutateAsync: mocks.grant, isPending: false }),
  useRevokeAccess: () => ({ mutateAsync: mocks.revoke, isPending: false }),
  useToggleInheritance: () => ({ mutateAsync: mocks.toggleInheritance, isPending: false }),
  useIamUsers: () => ({ data: mocks.users, isLoading: false }),
  useIamRoles: () => ({ data: mocks.roles, isLoading: false }),
  useIamOrganizations: () => ({ data: mocks.organizations, isLoading: false }),
  useDmsDirectory: () => ({ data: mocks.directoryDetail, isLoading: false }),
  useUpdateDmsDirectory: () => ({ mutateAsync: mocks.updateDirectory, isPending: false }),
}));

vi.mock("../../hooks/use-storage-file", () => ({
  useGetFile: () => ({ data: mocks.fileDetail, isLoading: false }),
  useUpdateFileAdditionalInfo: () => ({ mutateAsync: mocks.updateFile, isPending: false }),
}));

import { ManageAccessModal } from "./manage-access-modal";

const item = (over: Record<string, unknown> = {}) =>
  ({
    itemId: "dir-1",
    name: "Reports",
    type: "directory",
    inheritsParentAccess: true,
    isArchived: false,
    isActive: true,
    childDirectoryCount: 0,
    childFileCount: 0,
    sizeInBytes: 0,
    permissions: {
      canView: true,
      canDownload: true,
      canEdit: true,
      canDelete: true,
      canManage: true,
      canOwner: true,
    },
    ...over,
  }) as never;

const policy = (over: Record<string, unknown> = {}) => ({
  itemId: "policy-1",
  principalType: "Role",
  principalId: "editors",
  permission: "Edit",
  effect: "Allow",
  priority: 0,
  isInherited: false,
  ...over,
});

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

describe("ManageAccessModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.policies = [];
    mocks.users = [
      { value: "u1", label: "Alice", description: "alice@x.com" },
      { value: "u2", label: "Bob", description: "bob@x.com" },
    ];
    mocks.roles = [{ value: "editors", label: "Editors" }];
    mocks.organizations = [{ value: "o1", label: "Acme" }];
    mocks.directoryDetail = undefined;
    mocks.fileDetail = undefined;
  });

  it("says where access comes from when the item has no entries of its own", async () => {
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText(/Access comes from the parent directory/)).toBeInTheDocument();
  });

  it("lists an existing entry by its resolved human-readable name, not its raw id", async () => {
    mocks.policies = [policy()];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText("Editors")).toBeInTheDocument();
    expect(screen.queryByText("editors")).not.toBeInTheDocument();
    expect(screen.getByText(/Direct rule/)).toBeInTheDocument();
  });

  it("falls back to the raw id when no matching principal is found", async () => {
    mocks.policies = [policy({ principalId: "unknown-role-slug" })];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText("unknown-role-slug")).toBeInTheDocument();
  });

  it("resolves a user principal's name from the IAM users list", async () => {
    mocks.policies = [policy({ principalType: "User", principalId: "u1" })];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
  });

  it("resolves the role's organization scope to a name as well", async () => {
    mocks.policies = [policy({ organizationId: "o1" })];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText(/Organization Acme/)).toBeInTheDocument();
  });

  it("marks an inherited entry and offers no revoke for it", async () => {
    mocks.policies = [policy({ isInherited: true })];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText(/Inherited from parent/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove rule" })).not.toBeInTheDocument();
  });

  it("revokes an entry the item owns", async () => {
    const user = userEvent.setup();
    mocks.policies = [policy()];
    mocks.revoke.mockResolvedValue({ itemId: "policy-1" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.click(await screen.findByRole("button", { name: "Remove rule" }));

    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("policy-1"));
  });

  it("will not grant to a named principal without a selection", async () => {
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByRole("button", { name: "Add access rule" })).toBeDisabled();
  });

  it("grants once a principal is picked from the dropdown", async () => {
    const user = userEvent.setup();
    mocks.grant.mockResolvedValue({ itemId: "policy-2" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    // Default principal type is User — open the picker and pick Alice.
    await user.click(screen.getByRole("combobox", { name: "Select user" }));
    await user.click(await screen.findByText("Alice"));
    await user.click(screen.getByRole("button", { name: "Add access rule" }));

    await waitFor(() =>
      expect(mocks.grant).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: "dir-1",
          resourceType: "Directory",
          principalType: "User",
          principalId: "u1",
          permission: "View",
          effect: "Allow",
        }),
      ),
    );
  });

  it("grants for multiple selected principals at once", async () => {
    const user = userEvent.setup();
    mocks.grant.mockResolvedValue({ itemId: "policy-x" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.click(screen.getByRole("combobox", { name: "Select user" }));
    await user.click(await screen.findByText("Alice"));
    await user.click(await screen.findByText("Bob"));
    await user.click(screen.getByRole("button", { name: "Add access rule" }));

    await waitFor(() => expect(mocks.grant).toHaveBeenCalledTimes(2));
    expect(mocks.grant).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ principalType: "User", principalId: "u1" }),
    );
    expect(mocks.grant).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ principalType: "User", principalId: "u2" }),
    );
  });

  it("grants a role only within the selected organization", async () => {
    const user = userEvent.setup();
    mocks.grant.mockResolvedValue({ itemId: "policy-role-org" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.click(screen.getByRole("button", { name: "Role" }));
    await user.click(screen.getByRole("combobox", { name: "Select role" }));
    await user.click(await screen.findByText("Editors"));
    await user.click(screen.getByRole("combobox", { name: "Role scope" }));
    await user.click(await screen.findByText("Acme"));
    await user.click(screen.getByRole("button", { name: "Add access rule" }));

    await waitFor(() =>
      expect(mocks.grant).toHaveBeenCalledWith(
        expect.objectContaining({
          principalType: "Role",
          principalId: "editors",
          organizationId: "o1",
        }),
      ),
    );
  });

  it("sends the global sentinel when a role applies to all organizations", async () => {
    const user = userEvent.setup();
    mocks.grant.mockResolvedValue({ itemId: "policy-global-role" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.click(screen.getByRole("button", { name: "Role" }));
    await user.click(screen.getByRole("combobox", { name: "Select role" }));
    await user.click(await screen.findByText("Editors"));
    await user.click(screen.getByRole("button", { name: "Add access rule" }));

    await waitFor(() =>
      expect(mocks.grant).toHaveBeenCalledWith(
        expect.objectContaining({
          principalType: "Role",
          principalId: "editors",
          organizationId: "default",
        }),
      ),
    );
  });

  it("grants for Everyone without a selection", async () => {
    const user = userEvent.setup();
    mocks.grant.mockResolvedValue({ itemId: "policy-e" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.click(screen.getByRole("button", { name: "Everyone" }));
    await user.click(screen.getByRole("button", { name: "Add access rule" }));

    await waitFor(() =>
      expect(mocks.grant).toHaveBeenCalledWith(
        expect.objectContaining({ principalType: "Everyone", principalId: undefined }),
      ),
    );
  });

  it("refuses to switch inheritance off while nothing else grants access", async () => {
    mocks.policies = [];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByRole("button", { name: "Turn off inheritance" })).toBeDisabled();
  });

  it("allows switching inheritance off once the item has its own entry", async () => {
    const user = userEvent.setup();
    mocks.policies = [policy()];
    mocks.toggleInheritance.mockResolvedValue({ itemId: "dir-1" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    const toggle = await screen.findByRole("button", { name: "Turn off inheritance" });
    expect(toggle).toBeEnabled();
    await user.click(toggle);

    await waitFor(() => expect(mocks.toggleInheritance).toHaveBeenCalledWith(false));
  });

  it("offers to switch inheritance back on when it is off", async () => {
    const user = userEvent.setup();
    mocks.toggleInheritance.mockResolvedValue({ itemId: "dir-1" });
    render(
      <ManageAccessModal
        open
        onOpenChange={vi.fn()}
        item={item({ inheritsParentAccess: false })}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Turn on inheritance" }));

    await waitFor(() => expect(mocks.toggleInheritance).toHaveBeenCalledWith(true));
  });

  it("reports a failed grant rather than claiming success", async () => {
    const user = userEvent.setup();
    mocks.grant.mockRejectedValue(new Error("refused"));
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.click(screen.getByRole("combobox", { name: "Select user" }));
    await user.click(await screen.findByText("Alice"));
    await user.click(screen.getByRole("button", { name: "Add access rule" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalled());
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  describe("General access", () => {
    it("shows the fetched default for a directory and saves a change", async () => {
      const user = userEvent.setup();
      mocks.directoryDetail = { objectAccessLevel: "Creator" };
      mocks.updateDirectory.mockResolvedValue({ directoryId: "dir-1" });
      render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

      const creatorOption = await screen.findByRole("button", {
        name: "Creator only, until shared",
      });
      expect(creatorOption).toHaveAttribute("aria-pressed", "true");

      await user.click(screen.getByRole("button", { name: "Anyone in my organization" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(mocks.updateDirectory).toHaveBeenCalledWith({
          directoryId: "dir-1",
          objectAccessLevel: "Organization",
          updateObjectAccessLevel: true,
        }),
      );
    });

    it("saves a file's general access through the file update path", async () => {
      const user = userEvent.setup();
      mocks.fileDetail = { objectAccessLevel: undefined };
      mocks.updateFile.mockResolvedValue({ isSuccess: true, errors: null });
      render(
        <ManageAccessModal
          open
          onOpenChange={vi.fn()}
          item={item({ itemId: "file-1", type: "file" })}
        />,
      );

      await user.click(await screen.findByRole("button", { name: "Creator only, until shared" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(mocks.updateFile).toHaveBeenCalledWith({
          itemId: "file-1",
          projectKey: "tenant-1",
          additionalProperties: {},
          objectAccessLevel: "Creator",
          updateObjectAccessLevel: true,
        }),
      );
    });

    it("disables Save until the selection actually changes", async () => {
      mocks.directoryDetail = { objectAccessLevel: "Creator" };
      render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

      expect(await screen.findByRole("button", { name: "Save" })).toBeDisabled();
    });
  });
});
