import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let selectedProject: Record<string, unknown> | null = {
  itemId: "item-1",
  tenantId: "tenant-1",
};
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject }),
}));

const useGetProject = vi.fn();
const mutateAsync = vi.fn();
vi.mock("@/hooks/use-project", () => ({
  useGetProject: (...a: unknown[]) => useGetProject(...a),
  useValidateCNameProject: () => ({ mutateAsync }),
}));

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));

vi.mock("@/components/project-detail/project-detail", () => ({
  ProjectDetail: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="project-detail">{isLoading ? "loading" : "loaded"}</div>
  ),
}));

import { DashboardOverview } from "./dashboard-overview";

beforeEach(() => {
  selectedProject = { itemId: "item-1", tenantId: "tenant-1" };
});
afterEach(() => vi.clearAllMocks());

describe("DashboardOverview", () => {
  it("renders the heading and project detail", () => {
    useGetProject.mockReturnValue({ data: undefined, isLoading: true });
    render(<DashboardOverview />);
    expect(screen.getByText("Environment Overview")).toBeInTheDocument();
    expect(screen.getByTestId("project-detail")).toHaveTextContent("loading");
  });

  it("skips CName validation for seliseblocks domains", async () => {
    useGetProject.mockReturnValue({
      data: { data: { applications: [{ domain: "https://foo.seliseblocks.com" }], customDomain: "https://x.com" } },
      isLoading: false,
    });
    render(<DashboardOverview />);
    await waitFor(() => expect(screen.getByTestId("project-detail")).toHaveTextContent("loaded"));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("validates the custom domain CName for non-seliseblocks domains", async () => {
    mutateAsync.mockResolvedValue(undefined);
    useGetProject.mockReturnValue({
      data: {
        data: {
          applications: [{ domain: "https://app.customer.io" }],
          customDomain: "https://portal.customer.io",
        },
      },
      isLoading: false,
    });
    render(<DashboardOverview />);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectKey: "tenant-1",
        cookieDomain: "portal.customer.io",
      }),
    );
  });

  it("shows an error toast when validation throws an errors object", async () => {
    mutateAsync.mockRejectedValue({ errors: { domain: "bad" } });
    useGetProject.mockReturnValue({
      data: {
        data: {
          applications: [{ domain: "https://app.customer.io" }],
          customDomain: "https://portal.customer.io",
        },
      },
      isLoading: false,
    });
    render(<DashboardOverview />);
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: { domain: "bad" } }),
    );
  });
});
