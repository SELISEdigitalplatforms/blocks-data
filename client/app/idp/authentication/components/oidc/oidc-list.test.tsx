import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const useGetAuthOidcCredentials = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-auth-oidc", () => ({
  useGetAuthOidcCredentials: (...a: unknown[]) => useGetAuthOidcCredentials(...a),
}));

vi.mock("./oidc-card", () => ({
  OIDCCard: ({ oidc }: { oidc: { itemId: string } }) => (
    <div data-testid="oidc-card">{oidc.itemId}</div>
  ),
}));

import { OidcList } from "./oidc-list";

afterEach(() => vi.clearAllMocks());

describe("OidcList", () => {
  it("renders a loading skeleton while fetching", () => {
    useGetAuthOidcCredentials.mockReturnValue({ isLoading: true, isFetching: false, data: undefined });
    render(<OidcList />);
    expect(screen.queryByTestId("oidc-card")).not.toBeInTheDocument();
  });

  it("shows an empty message when there is no configuration", () => {
    useGetAuthOidcCredentials.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: { oIDCClientCredentials: [] },
    });
    render(<OidcList />);
    expect(screen.getByText(/No OIDC configuration found/)).toBeInTheDocument();
  });

  it("renders cards sorted by created date descending", () => {
    useGetAuthOidcCredentials.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: {
        oIDCClientCredentials: [
          { itemId: "old", createdDate: "2023-01-01" },
          { itemId: "new", createdDate: "2024-06-01" },
        ],
      },
    });
    render(<OidcList />);
    const cards = screen.getAllByTestId("oidc-card");
    expect(cards.map((c) => c.textContent)).toEqual(["new", "old"]);
  });

  it("wraps a single non-array credential object into a list", () => {
    useGetAuthOidcCredentials.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: { oIDCClientCredentials: { itemId: "solo", createdDate: "2024-01-01" } },
    });
    render(<OidcList />);
    expect(screen.getByTestId("oidc-card")).toHaveTextContent("solo");
  });
});
