import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useGetAssets = vi.fn();
const useAddAssets = vi.fn();
vi.mock("@/hooks/use-project", () => ({
  useGetAssets: (...a: unknown[]) => useGetAssets(...a),
  useAddAssets: () => useAddAssets(),
}));

const useValidateAuthorization = vi.fn();
vi.mock("@/repository-integration/hooks/use-github-integration", () => ({
  useValidateAuthorization: () => useValidateAuthorization(),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedTenantGroup: "g1" }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

vi.mock(
  "@/components/repository-selection-modal/repository-selection-modal",
  () => ({
    RepositorySelectionModal: () => <div>repo-select-modal</div>,
  }),
);

vi.mock("@/repository-integration/components/render-provider", () => ({
  default: () => <div>provider-buttons</div>,
}));

import { RepositoriesPage } from "./repositories";

afterEach(() => vi.clearAllMocks());

describe("RepositoriesPage", () => {
  it("renders the heading and empty state when there are no repositories", () => {
    useGetAssets.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    useAddAssets.mockReturnValue({ mutateAsync: vi.fn() });
    useValidateAuthorization.mockReturnValue({
      data: undefined,
      refetch: vi.fn(),
    });

    render(<RepositoriesPage />);
    expect(screen.getByText("Repositories")).toBeInTheDocument();
    expect(screen.getByText(/No repositories found/)).toBeInTheDocument();
  });

  it("renders a row for each returned repository", () => {
    useGetAssets.mockReturnValue({
      data: {
        assets: {
          resources: [
            { name: "repo-a", link: "https://host/repo-a", resourceId: "1" },
          ],
        },
        totalCount: 1,
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    useAddAssets.mockReturnValue({ mutateAsync: vi.fn() });
    useValidateAuthorization.mockReturnValue({
      data: undefined,
      refetch: vi.fn(),
    });

    render(<RepositoriesPage />);
    expect(screen.getByText("repo-a")).toBeInTheDocument();
    expect(screen.getByText("https://host/repo-a")).toBeInTheDocument();
  });
});
