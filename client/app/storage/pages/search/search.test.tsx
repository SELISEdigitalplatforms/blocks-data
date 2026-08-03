import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  items: [] as unknown[],
  lastQuery: {} as { query?: string; directoryId?: string; type?: string },
  navigate: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
}));

vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/hooks/use-scoped-path", () => ({
  useStoragePath: () => "/app/storage",
}));

vi.mock("../../hooks/use-dms", () => ({
  useDmsSearch: (query: { query?: string; directoryId?: string; type?: string }) => {
    mocks.lastQuery = query;
    return {
      data: { pages: [{ items: mocks.items, totalChildCount: mocks.items.length, hasMore: false }] },
      isLoading: false,
      hasNextPage: mocks.hasNextPage,
      isFetchingNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
    };
  },
}));

import { StorageSearch } from "./search";

const renderAt = (path = "/app/storage/search") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <StorageSearch />
    </MemoryRouter>,
  );

const file = (over: Record<string, unknown> = {}) => ({
  itemId: "file-1",
  name: "report.pdf",
  type: "file",
  parentDirectoryId: "dir-1",
  sizeInBytes: 1024,
  inheritsParentAccess: true,
  isArchived: false,
  isActive: true,
  permissions: {
    canView: true,
    canDownload: true,
    canEdit: false,
    canDelete: false,
    canManage: false,
    canOwner: false,
  },
  ...over,
});

describe("StorageSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items = [];
    mocks.hasNextPage = false;
  });

  it("prompts for a term before searching anything", () => {
    renderAt();

    expect(screen.getByText(/Type to search/)).toBeInTheDocument();
  });

  it("reads the term from the url so a result set can be linked to", async () => {
    mocks.items = [file()];
    renderAt("/app/storage/search?q=report");

    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(mocks.lastQuery.query).toBe("report");
  });

  it("passes a directory scope through when the url carries one", () => {
    renderAt("/app/storage/search?q=report&directoryId=dir-9");

    expect(mocks.lastQuery.directoryId).toBe("dir-9");
  });

  it("narrows to one kind", async () => {
    const user = userEvent.setup();
    renderAt("/app/storage/search?q=report");

    await user.click(screen.getByRole("button", { name: "Directorys" }));

    await waitFor(() => expect(mocks.lastQuery.type).toBe("directory"));
  });

  it("sends no type filter when All is selected", async () => {
    const user = userEvent.setup();
    renderAt("/app/storage/search?q=report");

    await user.click(screen.getByRole("button", { name: "Files" }));
    await waitFor(() => expect(mocks.lastQuery.type).toBe("file"));

    await user.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(mocks.lastQuery.type).toBeUndefined());
  });

  it("opens a directory at itself", async () => {
    const user = userEvent.setup();
    mocks.items = [file({ itemId: "dir-2", name: "Reports", type: "directory" })];
    renderAt("/app/storage/search?q=rep");

    await user.click(await screen.findByRole("button", { name: /Reports/ }));

    expect(mocks.navigate).toHaveBeenCalledWith("/app/storage?directoryId=dir-2");
  });

  it("opens a file at its parent, since there is no file route to land on", async () => {
    const user = userEvent.setup();
    mocks.items = [file()];
    renderAt("/app/storage/search?q=rep");

    await user.click(await screen.findByRole("button", { name: /report\.pdf/ }));

    expect(mocks.navigate).toHaveBeenCalledWith("/app/storage?directoryId=dir-1");
  });

  it("says so when nothing matches", async () => {
    mocks.items = [];
    renderAt("/app/storage/search?q=nothinghere");

    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument();
  });

  it("puts a typed term in the url so the result set can be linked to", async () => {
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByPlaceholderText("Search files and directorys"), "budget");

    await waitFor(() => expect(mocks.lastQuery.query).toBe("budget"));
  });

  it("clears the term from the url when the box is emptied", async () => {
    const user = userEvent.setup();
    renderAt("/app/storage/search?q=budget");

    const box = screen.getByPlaceholderText("Search files and directorys");
    await user.clear(box);

    await waitFor(() => expect(mocks.lastQuery.query).toBe(""));
  });

  it("loads the next page of results on request", async () => {
    const user = userEvent.setup();
    mocks.items = [file()];
    mocks.hasNextPage = true;
    renderAt("/app/storage/search?q=report");

    await user.click(await screen.findByRole("button", { name: "Load more" }));

    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  it("does not navigate for a file with no parent to open", async () => {
    const user = userEvent.setup();
    mocks.items = [file({ parentDirectoryId: undefined })];
    renderAt("/app/storage/search?q=rep");

    await user.click(await screen.findByRole("button", { name: /report\.pdf/ }));

    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
