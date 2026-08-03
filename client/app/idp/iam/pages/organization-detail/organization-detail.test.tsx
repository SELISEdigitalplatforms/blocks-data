import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let orgResult: { data: unknown; isLoading: boolean };
vi.mock("@blocks-idp/iam/hooks/use-organization", () => ({
  useGetOrganizationById: () => orgResult,
}));
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/components/breadcrumb/breadcrumb", () => ({ default: () => <nav data-testid="breadcrumb" /> }));
vi.mock("@blocks-idp/iam/modules/organization-management/organization-users", () => ({
  OrganizationUsers: () => <div data-testid="org-users" />,
  InviteOrganizationUser: () => <div data-testid="invite-org-user" />,
}));

import { OrganizationDetail } from "./organization-detail";

afterEach(() => vi.clearAllMocks());

describe("OrganizationDetail", () => {
  it("renders the organization name and users once loaded", () => {
    orgResult = { data: { organization: { name: "Acme Corp" } }, isLoading: false };
    render(<OrganizationDetail id="o1" />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByTestId("org-users")).toBeInTheDocument();
    expect(screen.getByTestId("invite-org-user")).toBeInTheDocument();
  });

  it("renders a skeleton while loading", () => {
    orgResult = { data: undefined, isLoading: true };
    const { container } = render(<OrganizationDetail id="o1" />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
