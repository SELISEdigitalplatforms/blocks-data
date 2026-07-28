import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useProjectStore = vi.fn();
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => useProjectStore(),
  EnvironmentCard: ({ project }: { project: { itemId: string; name?: string } }) => (
    <div data-testid="environment-card">{project.name ?? project.itemId}</div>
  ),
}));

const useGetProjects = vi.fn();
const useGetMigrationStatus = vi.fn();
vi.mock("@/hooks/use-project", () => ({
  useGetProjects: (...a: unknown[]) => useGetProjects(...a),
  useGetMigrationStatus: (...a: unknown[]) => useGetMigrationStatus(...a),
}));

vi.mock("@/hooks/use-notification-listener", () => ({
  useNotificationListener: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/environment-card/add-environment-modal", () => ({
  AddEnvironmentModal: () => <div data-testid="add-env-modal" />,
}));
vi.mock("@/components/project-card/loading", () => ({
  ProjectCardLoading: () => <div data-testid="project-loading" />,
}));

import { EnvironmentsPage } from "./environments";

afterEach(() => vi.clearAllMocks());

describe("EnvironmentsPage", () => {
  it("renders loading placeholders while fetching", () => {
    useProjectStore.mockReturnValue({ selectedTenantGroup: "g1" });
    useGetProjects.mockReturnValue({ data: undefined, isLoading: true, isFetching: false });
    useGetMigrationStatus.mockReturnValue({ data: undefined, refetch: vi.fn() });
    render(<EnvironmentsPage />);
    expect(screen.getAllByTestId("project-loading").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no environments", () => {
    useProjectStore.mockReturnValue({ selectedTenantGroup: "g1" });
    useGetProjects.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    useGetMigrationStatus.mockReturnValue({ data: undefined, refetch: vi.fn() });
    render(<EnvironmentsPage />);
    expect(screen.getByText("No environments found in this project.")).toBeInTheDocument();
  });

  it("renders an environment card per project", () => {
    useProjectStore.mockReturnValue({ selectedTenantGroup: "g1" });
    useGetProjects.mockReturnValue({
      data: [
        {
          isShared: false,
          projects: [
            { itemId: "p1", name: "Dev", tenantId: "t1" },
            { itemId: "p2", name: "Prod", tenantId: "t2" },
          ],
        },
      ],
      isLoading: false,
      isFetching: false,
    });
    useGetMigrationStatus.mockReturnValue({
      data: [{ targetedProjectKey: "t1" }],
      refetch: vi.fn(),
    });
    render(<EnvironmentsPage />);
    expect(screen.getAllByTestId("environment-card")).toHaveLength(2);
    expect(screen.getByText("Dev")).toBeInTheDocument();
    expect(screen.getByText("Prod")).toBeInTheDocument();
  });

  it("renders the shared and others sections for shared groups", () => {
    useProjectStore.mockReturnValue({ selectedTenantGroup: "g1" });
    useGetProjects.mockReturnValue({
      data: [
        {
          isShared: true,
          projects: [{ itemId: "p1", name: "Shared", tenantId: "t1" }],
          nonSharedProject: [{ itemId: "p2", name: "Other", tenantId: "t2" }],
        },
      ],
      isLoading: false,
      isFetching: false,
    });
    useGetMigrationStatus.mockReturnValue({ data: [], refetch: vi.fn() });
    render(<EnvironmentsPage />);
    expect(screen.getByText("Shared with you")).toBeInTheDocument();
    expect(screen.getByText("Others")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });
});
