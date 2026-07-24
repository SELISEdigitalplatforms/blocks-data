import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useGetProjects = vi.fn();
const useUpdateTenantGroup = vi.fn();
vi.mock("@/hooks/use-project", () => ({
  useGetProjects: (...a: unknown[]) => useGetProjects(...a),
  useUpdateTenantGroup: (...a: unknown[]) => useUpdateTenantGroup(...a),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({
    selectedProject: { itemId: "p1", name: "Proj" },
    selectedTenantGroup: "g1",
    setSelectedProject: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { SettingsPage } from "./settings";

afterEach(() => vi.clearAllMocks());

describe("SettingsPage", () => {
  it("shows the loading skeleton while fetching", () => {
    useGetProjects.mockReturnValue({ data: undefined, isLoading: true });
    useUpdateTenantGroup.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const { container } = render(<SettingsPage />);
    expect(container.querySelector("main")).toBeInTheDocument();
    expect(screen.queryByText("Project Settings")).not.toBeInTheDocument();
  });

  it("renders the project details once loaded", () => {
    useGetProjects.mockReturnValue({
      data: [
        {
          projects: [
            { itemId: "p1", name: "Proj", createdDate: "2024-01-01" },
          ],
        },
      ],
      isLoading: false,
    });
    useUpdateTenantGroup.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    render(<SettingsPage />);
    expect(screen.getByText("Project Settings")).toBeInTheDocument();
    expect(screen.getByText("General Information")).toBeInTheDocument();
    expect(screen.getByText("Proj")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
  });
});
