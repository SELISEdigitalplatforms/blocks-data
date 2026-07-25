import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

vi.mock("nuqs", () => ({
  useQueryState: (_k: string, opts: { defaultValue: string }) => useState(opts.defaultValue),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let userData: Record<string, unknown> | undefined;
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData }),
}));

vi.mock("@/components/breadcrumb/breadcrumb", () => ({ default: () => <nav data-testid="crumb" /> }));
vi.mock("../../../components/user-details", () => ({ UserDetails: () => <div data-testid="details" /> }));
vi.mock("./user-action-menu", () => ({ UserActionMenu: () => <div data-testid="actions" /> }));
vi.mock("../user-devices", () => ({ UserDevices: () => <div data-testid="devices" /> }));
vi.mock("../user-histories", () => ({ UserHistories: () => <div data-testid="history" /> }));
vi.mock("../user-memberships", () => ({ UserMemberships: () => <div data-testid="memberships" /> }));

import { User } from "./user";

beforeEach(() => {
  userData = { data: { itemId: "u1", firstName: "Ada", lastName: "Lovelace" } };
});
afterEach(() => vi.clearAllMocks());

describe("User", () => {
  it("renders the user name and the details tab by default", () => {
    render(<User id="u1" />);
    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/Lovelace/)).toBeInTheDocument();
    expect(screen.getByTestId("details")).toBeInTheDocument();
    expect(screen.getByTestId("memberships")).toBeInTheDocument();
    expect(screen.getAllByTestId("actions").length).toBeGreaterThan(0);
  });

  it("renders the tab triggers", () => {
    render(<User id="u1" />);
    expect(screen.getByRole("tab", { name: "Devices" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();
  });
});
