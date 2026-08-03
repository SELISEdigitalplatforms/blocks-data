import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { IProject } from "@/identifier/models/project.model";

const navigate = vi.fn();
const setTennantGroup = vi.fn();
const setSelectedProject = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ setTennantGroup, setSelectedProject }),
}));

import { ProjectCard } from "./project-card";

const project = (over: Partial<IProject> = {}): IProject =>
  ({
    itemId: "p1",
    name: "My Project",
    tenantGroupId: "tg-1",
    tenantId: "t-1",
    environment: "dev",
    ...over,
  }) as IProject;

beforeEach(() => vi.clearAllMocks());

const renderCard = (p: IProject, projects: IProject[]) =>
  render(
    <MemoryRouter>
      <ProjectCard project={p} projects={projects} />
    </MemoryRouter>,
  );

describe("ProjectCard", () => {
  it("renders the project name", () => {
    renderCard(project(), [project()]);
    expect(screen.getByText("My Project")).toBeInTheDocument();
  });

  it("shows a placeholder when there are no environments", () => {
    renderCard(project(), []);
    expect(screen.getByText("No environments")).toBeInTheDocument();
  });

  it("renders one chip per environment with its option label", () => {
    renderCard(project(), [
      project({ environment: "dev" }),
      project({ environment: "prod" }),
    ]);
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
  });

  it("collapses to three chips plus a +N badge beyond three environments", () => {
    renderCard(project(), [
      project({ environment: "dev" }),
      project({ environment: "test" }),
      project({ environment: "stg" }),
      project({ environment: "uat" }),
      project({ environment: "prod" }),
    ]);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("configures the project and navigates to the overview", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const p = project({ tenantGroupId: "tg-9" });
    const { container } = renderCard(p, [p]);
    const configureBtn = container
      .querySelector("svg.lucide-settings2")
      ?.closest("button");
    expect(configureBtn).toBeTruthy();
    await user.click(configureBtn as Element);
    expect(setTennantGroup).toHaveBeenCalledWith("tg-9");
    expect(setSelectedProject).toHaveBeenCalledWith(p);
    expect(navigate).toHaveBeenCalledWith("/project-overview/environments");
  });

  it("navigates to the dashboard when an environment chip is clicked", async () => {
    const user = userEvent.setup();
    const p = project({ environment: "prod", tenantGroupId: "tg-prod" });
    renderCard(project(), [p]);
    await user.click(screen.getByText("Production"));
    expect(setTennantGroup).toHaveBeenCalledWith("tg-prod");
    expect(setSelectedProject).toHaveBeenCalledWith(p);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });
});
