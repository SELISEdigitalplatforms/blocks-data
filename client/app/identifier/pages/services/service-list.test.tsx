import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setQueryParams = vi.fn();
let queryParams = { page: 0, pageSize: 10 };
vi.mock("nuqs", () => ({
  useQueryStates: () => [queryParams, setQueryParams],
  parseAsInteger: { withDefault: (d: unknown) => d },
}));

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const useGetAllServices = vi.fn();
vi.mock("@/identifier/hooks/use-services", () => ({
  useGetAllServices: (...a: unknown[]) => useGetAllServices(...a),
}));

vi.mock("@/identifier/components/service-card/service-card", () => ({
  ServiceCard: ({ service }: { service: { itemId: string } }) => (
    <div data-testid="service-card">{service.itemId}</div>
  ),
}));
vi.mock("@/components/ui-kits/pagination/pagination", () => ({
  Pagination: () => <div data-testid="pagination" />,
}));

import { ServiceList } from "./service-list";

afterEach(() => {
  vi.clearAllMocks();
  queryParams = { page: 0, pageSize: 10 };
});

describe("ServiceList", () => {
  it("renders the loading skeleton while fetching", () => {
    useGetAllServices.mockReturnValue({ data: undefined, isLoading: true, isFetching: false });
    const { container } = render(<ServiceList />);
    expect(container.querySelector(".grid")).toBeInTheDocument();
    expect(screen.queryByTestId("service-card")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no services", () => {
    useGetAllServices.mockReturnValue({
      data: { totalCount: 0, data: [] },
      isLoading: false,
      isFetching: false,
    });
    render(<ServiceList />);
    expect(screen.getByText("No services found")).toBeInTheDocument();
  });

  it("renders a card per service", () => {
    useGetAllServices.mockReturnValue({
      data: {
        totalCount: 2,
        data: [
          { itemId: "s1", metadata: null },
          { itemId: "s2", metadata: { x: 1 } },
        ],
      },
      isLoading: false,
      isFetching: false,
    });
    render(<ServiceList />);
    expect(screen.getAllByTestId("service-card")).toHaveLength(2);
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });

  it("renders pagination when total exceeds the page size", () => {
    useGetAllServices.mockReturnValue({
      data: {
        totalCount: 25,
        data: [{ itemId: "s1", metadata: {} }],
      },
      isLoading: false,
      isFetching: false,
    });
    render(<ServiceList />);
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
  });
});
