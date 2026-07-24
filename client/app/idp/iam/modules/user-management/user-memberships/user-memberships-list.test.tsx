import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./remove-membership", () => ({
  RemoveMembership: ({ open }: { open: boolean }) =>
    open ? <div data-testid="remove-membership" /> : null,
}));
vi.mock("./edit-membership", () => ({
  EditMembership: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-membership" /> : null,
}));

import { UserMembershipsList } from "./user-memberships-list";

const membership = (over: Record<string, unknown> = {}) => ({
  organizationId: "org-1",
  roles: ["admin", "editor"],
  permissions: ["p1", "p2", "p3", "p4", "p5", "p6"],
  ...over,
});

const orgNameMap = new Map<string, string>([["org-1", "Acme Org"]]);

const renderList = (props: Partial<Record<string, unknown>> = {}) =>
  render(
    <UserMembershipsList
      memberships={(props.memberships ?? [membership()]) as never}
      orgNameMap={orgNameMap}
      isLoading={!!props.isLoading}
      userId="user-1"
      projectKey="tenant-1"
    />,
  );

beforeEach(() => vi.clearAllMocks());

describe("UserMembershipsList", () => {
  it("shows skeletons while loading", () => {
    const { container } = renderList({ isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no memberships", () => {
    renderList({ memberships: [] });
    expect(screen.getByText("No organization memberships found")).toBeInTheDocument();
  });

  it("renders the org name, roles and a permissions overflow badge", () => {
    renderList();
    expect(screen.getByText("Acme Org")).toBeInTheDocument();
    expect(screen.getByText("admin, editor")).toBeInTheDocument();
    // 6 permissions -> 4 shown + "+2" overflow.
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("falls back to a dash for empty roles and permissions", () => {
    renderList({ memberships: [membership({ roles: [], permissions: [] })] });
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("opens the configure drawer from the actions menu", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Configure"));
    expect(await screen.findByTestId("edit-membership")).toBeInTheDocument();
  });

  it("opens the unassign modal from the actions menu", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Unassign User"));
    expect(await screen.findByTestId("remove-membership")).toBeInTheDocument();
  });
});
