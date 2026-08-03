import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const projectState: {
  selectedProject: unknown;
  selectedTenantGroup: string;
} = { selectedProject: { itemId: "p1" }, selectedTenantGroup: "tg1" };
let projectsData: unknown[] | undefined = [{ itemId: "p1" }];

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>(
      "react-router",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => projectState,
}));

vi.mock("@/hooks/use-project", () => ({
  useGetProjects: () => ({ data: projectsData }),
}));

import { ProjectGuard } from "./project-guard";

function renderGuard() {
  return render(
    <ProjectGuard>
      <div>project-child</div>
    </ProjectGuard>,
  );
}

describe("ProjectGuard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    projectState.selectedProject = { itemId: "p1" };
    projectState.selectedTenantGroup = "tg1";
    projectsData = [{ itemId: "p1" }];
  });
  afterEach(() => vi.clearAllMocks());

  it("renders children when a project is selected", () => {
    renderGuard();
    expect(screen.getByText("project-child")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("renders nothing and redirects when no project is selected", async () => {
    projectState.selectedProject = null;
    renderGuard();
    expect(screen.queryByText("project-child")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/console", { replace: true }),
    );
  });

  it("redirects when the environment list is empty", async () => {
    projectsData = [];
    renderGuard();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/console", { replace: true }),
    );
  });
});
