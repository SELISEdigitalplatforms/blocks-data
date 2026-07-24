import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const deactivateMagicUrl = vi.fn();
let isRemoving = false;

vi.mock("./magic-urls-filter-toolbar", () => ({
  useMagicUrlSortQueryParams: () => ({ sortQueryParams: {}, setSortQueryParams: vi.fn() }),
}));
vi.mock("@/components/filter-toolbar", () => ({
  FilterControls: { SortHeader: ({ label }: { label: string }) => <span>{label}</span> },
}));
vi.mock("./magic-url-status-badge", () => ({
  MagicUrlStatusBadge: () => <span data-testid="status-badge" />,
}));
vi.mock("@/components/copy-to-clipboard-button", () => ({
  CopyToClipboardButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@/magic-url/hooks/use-deactivate-magic-url", () => ({
  useDeactivateMagicUrl: () => ({ deactivateMagicUrl, isRemoving }),
}));
vi.mock("@/components/confirmation-modal/confirmation-modal", () => ({
  default: ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="confirm-modal">
      <button onClick={onConfirm}>confirm-deactivate</button>
      <button onClick={onCancel}>cancel-deactivate</button>
    </div>
  ),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { MagicUrlsList } from "./magic-urls-list";

const item = (over: Record<string, unknown> = {}) => ({
  itemId: "mu-1",
  uri: "https://example.com/target",
  shortUri: "https://sho.rt/abc",
  name: "Launch",
  usageLimit: 0,
  expiryDate: "2026-12-31T00:00:00Z",
  status: 1,
  requestMethod: "get",
  clientCredential: "cred-1",
  ...over,
});

const renderList = (props: { data?: unknown[]; isLoading?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <MagicUrlsList data={(props.data ?? [item()]) as never} isLoading={!!props.isLoading} />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  isRemoving = false;
  deactivateMagicUrl.mockImplementation((_id, _tenant, cb) => cb?.());
});

describe("MagicUrlsList", () => {
  it("shows skeletons while loading", () => {
    const { container } = renderList({ isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders a magic url row with unlimited usage and status badge", () => {
    renderList();
    expect(screen.getByText("Launch")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/target")).toBeInTheDocument();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge")).toBeInTheDocument();
  });

  it("shows the empty state when there is no data", () => {
    renderList({ data: [] });
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("navigates to the details page when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByText("Launch"));
    expect(navigateMock).toHaveBeenCalledWith("/utilities/magic-url/details/mu-1");
  });

  it("deactivates a magic url through the row actions menu and confirmation", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Deactivate"));
    await user.click(screen.getByText("confirm-deactivate"));
    await waitFor(() =>
      expect(deactivateMagicUrl).toHaveBeenCalledWith("mu-1", "tenant-1", expect.any(Function)),
    );
  });
});
