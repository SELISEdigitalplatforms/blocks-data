import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetProjects = vi.fn();
const useGetProject = vi.fn();
const setSelectedProject = vi.fn();
let storeState: Record<string, unknown> = {};

vi.mock("@/hooks/use-project", () => ({
  useGetProjects: () => useGetProjects(),
  useGetProject: () => useGetProject(),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => storeState,
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/dashboard" }),
}));

import { EnvironmentList } from "./environment-list";

beforeEach(() => {
  vi.clearAllMocks();
  storeState = {
    selectedProject: {
      itemId: "p1",
      environment: "Production",
      applications: [{ domain: "app.example.com" }],
    },
    setSelectedProject,
  };
  useGetProjects.mockReturnValue({
    data: [{ projects: [{ itemId: "p1", environment: "Production" }, { itemId: "p2", environment: "Staging" }] }],
    isLoading: false,
  });
  useGetProject.mockReturnValue({
    data: { data: { itemId: "p1", environment: "Production", applications: [{ domain: "app.example.com" }] } },
  });
});

describe("EnvironmentList", () => {
  it("renders the environment label in expanded mode", () => {
    render(<EnvironmentList />);
    expect(screen.getByText("Environment")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
  });

  it("prompts to select an environment when none is set", () => {
    storeState = { selectedProject: null, setSelectedProject };
    useGetProject.mockReturnValue({ data: undefined });
    render(<EnvironmentList />);
    expect(screen.getByText("Select an Environment")).toBeInTheDocument();
  });

  it("renders the collapsed globe trigger with a tooltip label", () => {
    render(<EnvironmentList collapsed />);
    // Collapsed mode shows the environment + domain in the hover label.
    expect(screen.getByText(/Production - app.example.com/)).toBeInTheDocument();
  });
});
