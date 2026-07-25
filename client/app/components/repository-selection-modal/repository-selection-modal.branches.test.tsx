import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const reposResponse = (items: unknown, total: number) => ({
  data: { items, total_count: total },
});

const tenRepos = Array.from({ length: 10 }, (_, i) => repo(i + 1, `org/r${i + 1}`));

function setup(props: Partial<Record<string, unknown>> = {}) {
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
}

beforeEach(() => {
  vi.clearAllMocks();
  useGetGithubRepos.mockReturnValue({
    data: reposResponse([repo(1, "org/alpha")], 1),
    isLoading: false,
    isFetching: false,
  });
});

describe("RepositorySelectionModal - data shape branches", () => {
  it("treats a non-array items payload as empty", () => {
    useGetGithubRepos.mockReturnValue({
      data: reposResponse(null, 5),
      isLoading: false,
      isFetching: false,
    });
    setup();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("treats an empty items array as no more data on the first page", () => {
    useGetGithubRepos.mockReturnValue({
      data: reposResponse([], 5),
      isLoading: false,
      isFetching: false,
    });
    setup();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});

describe("RepositorySelectionModal - infinite scroll", () => {
  it("loads and appends the next page on scroll", async () => {
    const user = userEvent.setup();
    // Page-aware mock with STABLE per-page references so the data effect does
    // not re-run on every render (which would loop infinitely).
    const page1Result = {
      data: reposResponse(tenRepos, 25),
      isLoading: false,
      isFetching: false,
    };
    const page2Result = {
      data: reposResponse([repo(11, "org/r11"), repo(12, "org/r12")], 25),
      isLoading: false,
      isFetching: false,
    };
    useGetGithubRepos.mockImplementation(
      (_open: boolean, _term: string | undefined, page: number) =>
        page === 1 ? page1Result : page2Result,
    );
    setup();
    await user.click(screen.getByRole("combobox"));
    // First page items are visible.
    expect(await screen.findByText("org/r1")).toBeInTheDocument();

    const list = document.querySelector(
      "[cmdk-list]",
    ) as HTMLDivElement;
    // Fire the scroll + wheel handlers; jsdom reports 0 sizes so isNearBottom is true.
    fireEvent.scroll(list);
    fireEvent.wheel(list, { deltaY: 40 });

    // The appended page-2 repositories now render.
    await waitFor(() => expect(screen.getByText("org/r11")).toBeInTheDocument());
    expect(useGetGithubRepos).toHaveBeenCalledWith(true, undefined, 2, 10);
  });
});

describe("RepositorySelectionModal - lifecycle + revoke", () => {
  it("clears internal state when the modal is closed", () => {
    const { rerender } = setup();
    rerender(
      <RepositorySelectionModal
        open={false}
        onOpenChange={vi.fn()}
        onSelectRepository={vi.fn()}
      />,
    );
    // Reopening resets cleanly (no crash, combobox available again).
    rerender(
      <RepositorySelectionModal
        open
        onOpenChange={vi.fn()}
        onSelectRepository={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("cancels the revoke-access confirmation", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText("Revoke repository access"));
    const modal = await screen.findByTestId("confirm-modal");
    await user.click(within(modal).getByText("cancel-revoke"));
    // The confirm modal wiring stays intact after cancel.
    expect(revokeAccess).not.toHaveBeenCalled();
  });

  it("swallows a revoke error and still reloads", async () => {
    const user = userEvent.setup();
    revokeAccess.mockRejectedValue(new Error("nope"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });
    setup();
    await user.click(screen.getByText("Revoke repository access"));
    const modal = await screen.findByTestId("confirm-modal");
    await user.click(within(modal).getByText("confirm-revoke"));
    await waitFor(() => expect(errSpy).toHaveBeenCalled());
    await waitFor(() => expect(reload).toHaveBeenCalled());
    errSpy.mockRestore();
  });
});
