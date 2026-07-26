import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let userData: unknown;
let orgsData: unknown;
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData, isLoading: false }),
}));
vi.mock("@blocks-idp/iam/hooks/use-organization", () => ({
  useGetOrganizations: () => ({ data: orgsData, isLoading: false }),
}));

let capturedProps: Record<string, unknown> = {};
vi.mock("./user-memberships-list", () => ({
  UserMembershipsList: (props: Record<string, unknown>) => {
    capturedProps = props;
    return <div data-testid="memberships-list" />;
  },
}));
vi.mock("./assign-organization", () => ({
  AssignOrganization: () => <div data-testid="assign-org" />,
}));

import { UserMemberships } from "./user-memberships";

afterEach(() => {
  vi.clearAllMocks();
  capturedProps = {};
});

describe("UserMemberships", () => {
  it("renders the card, assign action and memberships list", () => {
    userData = { data: { memberships: [{ organizationId: "o1" }] } };
    orgsData = { organizations: [{ itemId: "o1", name: "Acme" }] };
    render(<UserMemberships id="u1" projectKey="t1" />);
    expect(screen.getByText("Organization")).toBeInTheDocument();
    expect(screen.getByTestId("assign-org")).toBeInTheDocument();
    expect(screen.getByTestId("memberships-list")).toBeInTheDocument();
  });

  it("builds an org name map keyed by organization id", () => {
    userData = { data: { memberships: [] } };
    orgsData = { organizations: [{ itemId: "o1", name: "Acme" }] };
    render(<UserMemberships id="u1" projectKey="t1" />);
    const map = capturedProps.orgNameMap as Map<string, string>;
    expect(map.get("o1")).toBe("Acme");
  });

  it("defaults to empty memberships when the user data is missing", () => {
    userData = undefined;
    orgsData = undefined;
    render(<UserMemberships id="u1" projectKey="t1" />);
    expect(capturedProps.memberships).toEqual([]);
  });
});
