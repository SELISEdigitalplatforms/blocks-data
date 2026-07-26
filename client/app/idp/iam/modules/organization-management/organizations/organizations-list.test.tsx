import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();

vi.mock("./organizations-filter-toolbar", () => ({
  useOrganizationsSortQueryParams: () => ({ sortQueryParams: {}, setSortQueryParams: vi.fn() }),
}));
vi.mock("../update-organization", () => ({
  UpdateOrganization: () => <div data-testid="update-organization" />,
}));
vi.mock("../toggle-organization-status", () => ({
  ToggleOrganizationStatus: () => <div data-testid="toggle-status" />,
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { OrganizationsList } from "./organizations-list";

const org = (over: Record<string, unknown> = {}) => ({
  itemId: "org-1",
  name: "Acme",
  isEnable: true,
  ...over,
});

const renderList = (props: { organizations?: unknown[]; isLoading?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <OrganizationsList
        organizations={(props.organizations ?? [org()]) as never}
        isLoading={!!props.isLoading}
      />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe("OrganizationsList", () => {
  it("shows skeletons while loading", () => {
    const { container } = renderList({ isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no organizations", () => {
    renderList({ organizations: [] });
    expect(screen.getByText("No organizations found")).toBeInTheDocument();
  });

  it("renders an active organization row", () => {
    renderList();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders a disabled organization badge", () => {
    renderList({ organizations: [org({ isEnable: false })] });
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("navigates to the organization detail on row click", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByText("Acme"));
    expect(navigateMock).toHaveBeenCalledWith("/services/iam/organization-detail/org-1");
  });

  it("opens the rename dialog from the actions menu", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Rename"));
    expect(await screen.findByTestId("update-organization")).toBeInTheDocument();
  });

  it("hides actions for the default organization", () => {
    renderList({ organizations: [org({ itemId: "default" })] });
    expect(screen.queryByRole("button", { name: "" })).not.toBeInTheDocument();
  });
});
