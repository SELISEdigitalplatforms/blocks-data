import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  policies: [] as unknown[],
  grant: vi.fn(),
  revoke: vi.fn(),
  toggleInheritance: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
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
}));

import { ManageAccessModal } from "./manage-access-modal";

const item = (over: Record<string, unknown> = {}) =>
  ({
    itemId: "dir-1",
    name: "Reports",
    type: "folder",
    inheritsParentAccess: true,
    isArchived: false,
    isActive: true,
    childFolderCount: 0,
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
  });

  it("says where access comes from when the item has no entries of its own", async () => {
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText(/Access comes from the parent folder/)).toBeInTheDocument();
  });

  it("lists an existing entry", async () => {
    mocks.policies = [policy()];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText("Role: editors")).toBeInTheDocument();
    expect(screen.getByText("Allow Edit")).toBeInTheDocument();
  });

  it("marks an inherited entry and offers no revoke for it", async () => {
    // An inherited entry belongs to an ancestor. Revoking it here would either
    // do nothing or silently affect a different resource, so it is not offered.
    mocks.policies = [policy({ isInherited: true })];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByText("inherited")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });

  it("revokes an entry the item owns", async () => {
    const user = userEvent.setup();
    mocks.policies = [policy()];
    mocks.revoke.mockResolvedValue({ itemId: "policy-1" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.click(await screen.findByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("policy-1"));
  });

  it("will not grant to a named principal without an identifier", async () => {
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByRole("button", { name: "Grant" })).toBeDisabled();
  });

  it("grants once an identifier is supplied", async () => {
    const user = userEvent.setup();
    mocks.grant.mockResolvedValue({ itemId: "policy-2" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.type(await screen.findByLabelText("User id"), "user-2");
    await user.click(screen.getByRole("button", { name: "Grant" }));

    await waitFor(() =>
      expect(mocks.grant).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: "dir-1",
          resourceType: "Folder",
          principalType: "User",
          principalId: "user-2",
          permission: "View",
          effect: "Allow",
        }),
      ),
    );
  });

  it("refuses to switch inheritance off while nothing else grants access", async () => {
    // The server rejects this because the item would become invisible to
    // everyone, including whoever flipped the switch. Disabling states the rule
    // rather than waiting for the rejection.
    mocks.policies = [];
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    expect(await screen.findByRole("button", { name: "Turn off" })).toBeDisabled();
  });

  it("allows switching inheritance off once the item has its own entry", async () => {
    const user = userEvent.setup();
    mocks.policies = [policy()];
    mocks.toggleInheritance.mockResolvedValue({ itemId: "dir-1" });
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    const toggle = await screen.findByRole("button", { name: "Turn off" });
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

    await user.click(await screen.findByRole("button", { name: "Turn on" }));

    await waitFor(() => expect(mocks.toggleInheritance).toHaveBeenCalledWith(true));
  });

  it("reports a failed grant rather than claiming success", async () => {
    const user = userEvent.setup();
    mocks.grant.mockRejectedValue(new Error("refused"));
    render(<ManageAccessModal open onOpenChange={vi.fn()} item={item()} />);

    await user.type(await screen.findByLabelText("User id"), "user-2");
    await user.click(screen.getByRole("button", { name: "Grant" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalled());
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});
