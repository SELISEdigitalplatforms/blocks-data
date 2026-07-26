import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

let onSelectRepository: ((repo: unknown) => void) | undefined;
let selectModalOpen = false;
vi.mock("@/components/repository-selection-modal/repository-selection-modal", () => ({
  RepositorySelectionModal: ({
    open,
    onSelectRepository: f,
  }: {
    open: boolean;
    onSelectRepository: (repo: unknown) => void;
  }) => {
    onSelectRepository = f;
    selectModalOpen = open;
    return open ? <div data-testid="repo-select-modal" /> : null;
  },
}));

let onProviderClose: ((verify?: boolean) => void) | undefined;
vi.mock("@/repository-integration/components/render-provider", () => ({
  default: ({ onClose }: { onClose: (verify?: boolean) => void }) => {
    onProviderClose = onClose;
    return <div>provider-buttons</div>;
  },
}));

import { RepositoriesPage } from "./repositories";

function setup(overrides: Record<string, unknown> = {}) {
  const refetch = vi.fn();
  const mutateAsync = vi.fn().mockResolvedValue(undefined);
  const refetchAuthorization = vi.fn().mockResolvedValue({ data: { isSuccess: false } });
  useGetAssets.mockReturnValue({
    data: { assets: { resources: [{ name: "repo-a", link: "https://host/repo-a", resourceId: "1" }] }, totalCount: 1 },
    isLoading: false,
    isFetching: false,
    refetch,
    ...overrides,
  });
  useAddAssets.mockReturnValue({ mutateAsync });
  useValidateAuthorization.mockReturnValue({ data: undefined, refetch: refetchAuthorization });
  return { refetch, mutateAsync, refetchAuthorization };
}

afterEach(() => {
  vi.clearAllMocks();
  onSelectRepository = undefined;
  onProviderClose = undefined;
  selectModalOpen = false;
});

describe("RepositoriesPage", () => {
  it("renders the heading and empty state when there are no repositories", () => {
    useGetAssets.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, refetch: vi.fn() });
    useAddAssets.mockReturnValue({ mutateAsync: vi.fn() });
    useValidateAuthorization.mockReturnValue({ data: undefined, refetch: vi.fn() });
    render(<RepositoriesPage />);
    expect(screen.getByText("Repositories")).toBeInTheDocument();
    expect(screen.getByText(/No repositories found/)).toBeInTheDocument();
  });

  it("renders a row for each returned repository", () => {
    setup();
    render(<RepositoriesPage />);
    expect(screen.getByText("repo-a")).toBeInTheDocument();
    expect(screen.getByText("https://host/repo-a")).toBeInTheDocument();
  });

  it("opens the repository selection modal when already authorized", async () => {
    const { refetchAuthorization } = setup();
    refetchAuthorization.mockResolvedValue({ data: { isSuccess: true } });
    render(<RepositoriesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() => expect(screen.getByTestId("repo-select-modal")).toBeInTheDocument());
  });

  it("opens the provider connection dialog when not authorized", async () => {
    setup();
    render(<RepositoriesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() => expect(screen.getByText("Connect repository")).toBeInTheDocument());
  });

  it("opens the provider dialog when the authorization check throws", async () => {
    const { refetchAuthorization } = setup();
    refetchAuthorization.mockRejectedValue(new Error("boom"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RepositoriesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() => expect(screen.getByText("Connect repository")).toBeInTheDocument());
    consoleError.mockRestore();
  });

  it("adds a repository and shows a success toast", async () => {
    const { mutateAsync, refetch } = setup();
    render(<RepositoriesPage />);
    await onSelectRepository?.({ id: 9, full_name: "org/repo", html_url: "https://host/org/repo" });
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantGroupId: "g1",
          resource: expect.objectContaining({ resourceId: "9", name: "org/repo" }),
        }),
      ),
    );
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows an error toast when adding a repository fails", async () => {
    const { mutateAsync } = setup();
    mutateAsync.mockRejectedValue(new Error("add failed"));
    render(<RepositoriesPage />);
    await onSelectRepository?.({ id: 9, full_name: "org/repo", html_url: "u" });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });

  it("opens a repository link in a new tab", () => {
    setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<RepositoriesPage />);
    fireEvent.click(screen.getByText("https://host/repo-a"));
    expect(openSpy).toHaveBeenCalledWith("https://host/repo-a", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("filters repositories through the search input", async () => {
    const user = userEvent.setup();
    setup();
    render(<RepositoriesPage />);
    await user.type(screen.getByPlaceholderText("Search repositories..."), "repo");
    expect(screen.getByPlaceholderText("Search repositories...")).toHaveValue("repo");
  });

  it("re-opens the selection modal when the provider dialog verifies auth", async () => {
    setup();
    render(<RepositoriesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() => expect(onProviderClose).toBeDefined());
    onProviderClose?.(true);
    await waitFor(() => expect(screen.getByTestId("repo-select-modal")).toBeInTheDocument());
  });
});
