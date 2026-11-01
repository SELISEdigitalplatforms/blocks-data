import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http-client";

const mocks = vi.hoisted(() => ({
  share: vi.fn(),
  isPending: false,
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  users: [] as { value: string; label: string }[],
  roles: [] as { value: string; label: string }[],
  organizations: [] as { value: string; label: string }[],
}));

vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: mocks.showSuccessToast,
  showErrorToast: mocks.showErrorToast,
  showInfoToast: vi.fn(),
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../../hooks/use-dms", () => ({
  useShareObjects: () => ({ mutateAsync: mocks.share, isPending: mocks.isPending }),
  useIamUsers: () => ({ data: mocks.users, isLoading: false }),
  useIamRoles: () => ({ data: mocks.roles, isLoading: false }),
  useIamOrganizations: () => ({ data: mocks.organizations, isLoading: false }),
}));

import { ShareObjectsModal } from "./share-objects-modal";

const items = [
  { itemId: "file-1", name: "a.pdf" },
  { itemId: "dir-1", name: "Reports" },
];

beforeAll(() => {
  // Radix Select and the picker's popover rely on these in jsdom.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPending = false;
  mocks.users = [
    { value: "user-1", label: "Alice" },
    { value: "user-2", label: "Bob" },
  ];
  mocks.roles = [{ value: "editor", label: "Editor" }];
  mocks.organizations = [{ value: "org-1", label: "Acme" }];
});

const renderModal = (overrides: Partial<Parameters<typeof ShareObjectsModal>[0]> = {}) => {
  const props = { open: true, onOpenChange: vi.fn(), items, onShared: vi.fn(), ...overrides };
  render(<ShareObjectsModal {...props} />);
  return props;
};

const pick = async (user: ReturnType<typeof userEvent.setup>, picker: string, ...labels: string[]) => {
  await user.click(screen.getByRole("combobox", { name: picker }));
  for (const label of labels) {
    await user.click(await screen.findByText(label));
  }
};

describe("ShareObjectsModal", () => {
  it("names the number of items in the title", () => {
    renderModal();

    expect(screen.getByRole("heading", { name: "Share 2 items" })).toBeInTheDocument();
  });

  it("keeps Share disabled until a principal is picked", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
  });

  it("shares files and folders with every picked user in one request", async () => {
    const user = userEvent.setup();
    mocks.share.mockResolvedValue({ items: [] });
    const props = renderModal();

    await pick(user, "Select user", "Alice", "Bob");
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1));
    expect(mocks.share).toHaveBeenCalledWith({
      resourceIds: ["file-1", "dir-1"],
      principals: [
        { principalType: "User", principalId: "user-1", organizationId: undefined },
        { principalType: "User", principalId: "user-2", organizationId: undefined },
      ],
      permission: "View",
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "Shared",
      description: "View on 2 items for 2 users.",
    });
    expect(props.onShared).toHaveBeenCalled();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("scopes a role to all organizations as default", async () => {
    const user = userEvent.setup();
    mocks.share.mockResolvedValue({ items: [] });
    renderModal();

    await user.click(screen.getByRole("button", { name: "Role" }));
    await pick(user, "Select role", "Editor");
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(mocks.share).toHaveBeenCalled());
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({
        principals: [{ principalType: "Role", principalId: "editor", organizationId: "default" }],
      }),
    );
  });

  it("shares with Everyone without a principal id", async () => {
    const user = userEvent.setup();
    mocks.share.mockResolvedValue({ items: [] });
    renderModal();

    await user.click(screen.getByRole("button", { name: "Everyone" }));
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(mocks.share).toHaveBeenCalled());
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({ principals: [{ principalType: "Everyone" }] }),
    );
  });

  it("names the items the caller cannot manage when the server refuses", async () => {
    const user = userEvent.setup();
    mocks.share.mockRejectedValue(
      new HttpError(403, { errors: { message: "denied", resourceIds: ["dir-1"] } as never }),
    );
    const props = renderModal();

    await pick(user, "Select user", "Alice");
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalled());
    expect(mocks.showErrorToast).toHaveBeenCalledWith({
      title: "Nothing was shared",
      errors: "You can't manage access on: Reports",
    });
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("names the items that no longer exist", async () => {
    const user = userEvent.setup();
    mocks.share.mockRejectedValue(
      new HttpError(404, { errors: { message: "missing", resourceIds: ["file-1"] } as never }),
    );
    renderModal();

    await pick(user, "Select user", "Alice");
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalled());
    expect(mocks.showErrorToast).toHaveBeenCalledWith({
      title: "Nothing was shared",
      errors: "Some items no longer exist: a.pdf",
    });
  });

  it("falls back to a generic message for any other failure", async () => {
    const user = userEvent.setup();
    mocks.share.mockRejectedValue(new HttpError(400, { errors: { Principals: "bad" } }));
    renderModal();

    await pick(user, "Select user", "Alice");
    await user.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalled());
    expect(mocks.showErrorToast).toHaveBeenCalledWith({
      title: "Nothing was shared",
      errors: "The items were not shared.",
    });
  });
});
