import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let projectGroups: unknown[] = [];
let isLoading = false;
let selectedProject: unknown = null;
let projectData: unknown = undefined;

vi.mock("@/hooks/use-project", () => ({
  useGetProjects: () => ({ data: projectGroups, isLoading }),
  useGetProject: () => ({ data: projectData }),
}));
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject, setSelectedProject: vi.fn() }),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/services/iam" }),
}));

import { ProjectList } from "./project-list";

beforeEach(() => {
  vi.clearAllMocks();
  isLoading = false;
  selectedProject = { itemId: "p1", name: "Selected One" };
  projectData = { data: { name: "Selected One" } };
  projectGroups = [
    { projects: [{ itemId: "p1", name: "Selected One" }] },
    { projects: [{ itemId: "p2", name: "Second" }] },
    { projects: [{ itemId: "p3", name: "Third" }] },
  ];
});

describe("ProjectList", () => {
  it("renders the selected project name in the expanded trigger", () => {
    render(<ProjectList />);
    expect(screen.getByText("Selected One")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
  });

  it("renders the collapsed variant with the folder icon", () => {
    const { container } = render(<ProjectList collapsed />);
    // Collapsed shows the name only in the hover tooltip label.
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("Selected One")).toBeInTheDocument();
  });

  it("falls back to a placeholder when nothing is selected", () => {
    selectedProject = null;
    projectData = undefined;
    render(<ProjectList />);
    expect(screen.getByText("Select a Project")).toBeInTheDocument();
  });

  it("renders without crashing when there are no project groups", () => {
    projectGroups = [];
    render(<ProjectList />);
    expect(screen.getByText("Project")).toBeInTheDocument();
  });
});
