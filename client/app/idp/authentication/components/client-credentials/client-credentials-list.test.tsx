import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const useGetAuthClientCredentials = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-auth-clients", () => ({
  useGetAuthClientCredentials: (...a: unknown[]) => useGetAuthClientCredentials(...a),
}));

vi.mock("./client-credential-card", () => ({
  ClientCredentialsCard: ({ clientCredential }: { clientCredential: { itemId: string } }) => (
    <div data-testid="cc-card">{clientCredential.itemId}</div>
  ),
}));

import { ClientCredentialList } from "./client-credentials-list";

afterEach(() => vi.clearAllMocks());

describe("ClientCredentialList", () => {
  it("renders a loading skeleton while fetching", () => {
    useGetAuthClientCredentials.mockReturnValue({ isLoading: false, isFetching: true, data: undefined });
    render(<ClientCredentialList />);
    expect(screen.queryByTestId("cc-card")).not.toBeInTheDocument();
  });

  it("shows an empty message when there are no client credentials", () => {
    useGetAuthClientCredentials.mockReturnValue({ isLoading: false, isFetching: false, data: [] });
    render(<ClientCredentialList />);
    expect(screen.getByText(/No client credential found/)).toBeInTheDocument();
  });

  it("renders cards sorted by created date descending", () => {
    useGetAuthClientCredentials.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: [
        { itemId: "old", createdDate: "2023-01-01" },
        { itemId: "new", createdDate: "2024-06-01" },
      ],
    });
    render(<ClientCredentialList />);
    const cards = screen.getAllByTestId("cc-card");
    expect(cards.map((c) => c.textContent)).toEqual(["new", "old"]);
  });
});
