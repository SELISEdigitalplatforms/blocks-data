import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let peopleResult: Record<string, unknown>;
vi.mock("@/hooks/use-people", () => ({
  useGetPeople: () => peopleResult,
}));

import { PeopleManagement } from "./people-management";

beforeEach(() => {
  peopleResult = {
    isLoading: false,
    data: {
      isOwner: true,
      peoples: [
        {
          peopleDetails: { firstName: "Ada", lastName: "Lovelace", email: "ada@test.com" },
          sharedEnvironments: [{ tenantId: "t1", environment: "prod" }],
        },
        { peopleDetails: { email: "grace@test.com" } },
      ],
    },
  };
});
afterEach(() => vi.clearAllMocks());

describe("PeopleManagement", () => {
  it("shows the loading skeleton while fetching", () => {
    peopleResult = { isLoading: true, data: undefined };
    const { container } = render(<PeopleManagement />);
    expect(container.querySelector("main")).toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });

  it("renders people with names, emails and environment badges", () => {
    render(<PeopleManagement />);
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@test.com")).toBeInTheDocument();
    expect(screen.getByText("prod")).toBeInTheDocument();
    // Person without a first name falls back to the email as the display name.
    expect(screen.getAllByText("grace@test.com").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no people", () => {
    peopleResult = { isLoading: false, data: { peoples: [], isOwner: false } };
    render(<PeopleManagement />);
    expect(screen.getByText("No people found in this project.")).toBeInTheDocument();
  });
});
