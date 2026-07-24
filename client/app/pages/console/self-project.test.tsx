import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useGetProjects = vi.fn();
vi.mock("@/hooks/use-project", () => ({
  useGetProjects: () => useGetProjects(),
}));
vi.mock("@/components/console-create/console-create", () => ({
  default: () => <div>console-create</div>,
}));
vi.mock("@/components/project-card/loading", () => ({
  ProjectCardLoading: () => <div>project-loading</div>,
}));
vi.mock("@/components/project-card/project-card", () => ({
  ProjectCard: () => <div>project-card</div>,
}));

import { SelfProject } from "./self-project";

afterEach(() => vi.clearAllMocks());

describe("SelfProject", () => {
  it("shows the loading skeletons while fetching", () => {
    useGetProjects.mockReturnValue({ isLoading: true, isFetching: true });
    render(<SelfProject />);
    expect(screen.getAllByText("project-loading").length).toBeGreaterThan(0);
  });

  it("shows the create-project entry when there are no projects", () => {
    useGetProjects.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: [],
    });
    render(<SelfProject />);
    expect(screen.getByText("console-create")).toBeInTheDocument();
  });

  it("lists the project cards and the group count when projects exist", () => {
    useGetProjects.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: [
        { tenantGroupId: "g1", projects: [{ itemId: "p1" }] },
        { tenantGroupId: "g2", projects: [{ itemId: "p2" }] },
      ],
    });
    render(<SelfProject />);
    expect(screen.getByText("Your Blocks Projects")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("project-card")).toHaveLength(2);
  });
});
