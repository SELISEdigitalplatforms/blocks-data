import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let urlsResult: Record<string, unknown>;
vi.mock("@/magic-url/hooks/use-magic-url", () => ({
  useGetMagicUrls: () => urlsResult,
  useSaveMagicUrlConfig: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("./magic-urls-filter-toolbar", () => ({
  MagicUrlsFilterToolBar: () => <div data-testid="toolbar" />,
  useMagicUrlsFilterQueryParams: () => ({
    queryParams: { page: 0, pageSize: 10, search: "" },
    setQueryParams: vi.fn(),
  }),
}));

vi.mock("./magic-urls-list", () => ({
  MagicUrlsList: ({ data, isLoading }: { data: unknown[]; isLoading: boolean }) => (
    <div data-testid="list">{isLoading ? "loading" : `${data.length} urls`}</div>
  ),
}));

vi.mock("@/magic-url/components/magic-url-dialog/magic-url-dialog", () => ({
  MagicUrlDialog: () => <div data-testid="shorten-dialog" />,
}));
vi.mock("@/magic-url/components/magic-url-config-dialog/magic-url-config-dialog", () => ({
  MagicUrlConfigDialog: () => <div data-testid="config-dialog" />,
}));

import { MagicUrls } from "./magic-urls";

beforeEach(() => {
  urlsResult = { isLoading: false, isFetching: false, data: { data: [{ id: 1 }], totalCount: 1 } };
});
afterEach(() => vi.clearAllMocks());

describe("MagicUrls", () => {
  it("renders the toolbar, dialogs and list", () => {
    render(<MagicUrls />);
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("shorten-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("config-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("list")).toHaveTextContent("1 urls");
  });

  it("shows loading while fetching", () => {
    urlsResult = { isLoading: true, isFetching: false, data: undefined };
    render(<MagicUrls />);
    expect(screen.getByTestId("list")).toHaveTextContent("loading");
  });

  it("shows pagination when the total exceeds the page size", () => {
    urlsResult = { isLoading: false, isFetching: false, data: { data: [{ id: 1 }], totalCount: 40 } };
    render(<MagicUrls />);
    expect(screen.getByText("Rows per page")).toBeInTheDocument();
  });
});
