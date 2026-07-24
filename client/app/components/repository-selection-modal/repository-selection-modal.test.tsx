import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const useGetGithubRepos = vi.fn();
const revokeAccess = vi.fn();

vi.mock("@/repository-integration/hooks/use-github-integration", () => ({
  useGetGithubRepos: (...a: unknown[]) => useGetGithubRepos(...a),
}));
vi.mock("@/repository-integration/services/github-info.service", () => ({
  githubInfoService: { revokeAccess: (...a: unknown[]) => revokeAccess(...a) },
}));
vi.mock("@/repository-integration/models/github-info", () => ({
  iconMap: { github: "github.svg", gitlab: "gitlab.svg", bitbucket: "bb.svg", azure: "az.svg", aws: "aws.svg" },
}));
// Render the confirmation modal inline so its confirm/cancel wiring is testable.
vi.mock("@/components/confirmation-modal/confirmation-modal", () => ({
  default: ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="confirm-modal">
      <button onClick={onConfirm}>confirm-revoke</button>
      <button onClick={onCancel}>cancel-revoke</button>
    </div>
  ),
}));

import { RepositorySelectionModal } from "./repository-selection-modal";

const repo = (id: number, name: string) => ({
  id,
  full_name: name,
  name,
  html_url: `https://github.com/${name}`,
});

const reposResponse = (items: unknown[], total = items.length) => ({
  data: { items, total_count: total },
});

const setup = (props: Partial<Record<string, unknown>> = {}) => {
  const onOpenChange = vi.fn();
  const onSelectRepository = vi.fn();
  const utils = render(
    <RepositorySelectionModal
      open
      onOpenChange={onOpenChange}
      onSelectRepository={onSelectRepository}
      {...props}
    />,
    { wrapper: createWrapper() },
  );
  return { onOpenChange, onSelectRepository, ...utils };
};

beforeEach(() => {
  vi.clearAllMocks();
  useGetGithubRepos.mockReturnValue({
    data: reposResponse([repo(1, "org/alpha"), repo(2, "org/beta")]),
    isLoading: false,
    isFetching: false,
  });
});

describe("RepositorySelectionModal", () => {
  it("renders the title, description and provider list with only GitHub enabled", () => {
    setup({ title: "Pick repo", description: "choose one" });
    expect(screen.getByText("Pick repo")).toBeInTheDocument();
    expect(screen.getByText("choose one")).toBeInTheDocument();
    // GitHub radio is checked and enabled; the others are disabled.
    const github = document.getElementById("github-radio") as HTMLInputElement;
    expect(github.checked).toBe(true);
    expect(github.disabled).toBe(false);
    expect((document.getElementById("gitlab-radio") as HTMLInputElement).disabled).toBe(true);
    // Result count from total_count.
    expect(screen.getByText(/\(2 results\)/)).toBeInTheDocument();
  });

  it("selects a repository from the popover and adds it", async () => {
    const user = userEvent.setup();
    const { onSelectRepository } = setup();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("org/alpha"));

    const addBtn = screen.getByRole("button", { name: "Add" });
    await waitFor(() => expect(addBtn).toBeEnabled());
    await user.click(addBtn);

    expect(onSelectRepository).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("blocks adding a repository that is already selected", async () => {
    const user = userEvent.setup();
    const { onSelectRepository } = setup({ selectedRepositories: [repo(1, "org/alpha")] });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("org/alpha"));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onSelectRepository).not.toHaveBeenCalled();
    expect(await screen.findByText("Repository already selected.")).toBeInTheDocument();
  });

  it("clears state and closes on Cancel", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an empty state when no repositories are returned", () => {
    useGetGithubRepos.mockReturnValue({
      data: reposResponse([], 0),
      isLoading: false,
      isFetching: false,
    });
    setup();
    // Add stays disabled with no selectable repo.
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("shows the loading label while repositories are fetching", () => {
    useGetGithubRepos.mockReturnValue({ data: undefined, isLoading: true, isFetching: true });
    setup();
    expect(screen.getByText("Loading repositories...")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("revokes GitHub access through the confirmation modal", async () => {
    const user = userEvent.setup();
    revokeAccess.mockResolvedValue(undefined);
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });
    setup();

    await user.click(screen.getByText("Revoke repository access"));
    const modal = await screen.findByTestId("confirm-modal");
    await user.click(within(modal).getByText("confirm-revoke"));

    await waitFor(() => expect(revokeAccess).toHaveBeenCalled());
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("debounces the search input and drives the query with the term", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText("Search repositories...");
    await user.type(input, "alpha");
    // After the 500ms debounce, the hook is re-invoked with the search term.
    await waitFor(
      () => expect(useGetGithubRepos).toHaveBeenCalledWith(true, "alpha", 1, 10),
      { timeout: 2000 },
    );
  });
});
