import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

const setSelectedProject = vi.fn();
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ setSelectedProject }),
}));

vi.mock("@/constants/environment-options", () => ({
  environmentOptions: [{ value: 1, label: "Production" }],
}));

import { EnvironmentCard } from "./environment-card";

const project = {
  itemId: "p1",
  tenantId: "tenant-123",
  environment: 1,
} as never;

afterEach(() => vi.clearAllMocks());

describe("EnvironmentCard", () => {
  it("shows the environment label and tenant key", () => {
    render(<EnvironmentCard project={project} />);
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText("tenant-123")).toBeInTheDocument();
  });

  it("selects the project and navigates to the dashboard on click when no migration", async () => {
    const user = userEvent.setup();
    render(<EnvironmentCard project={project} />);
    await user.click(screen.getByText("Production"));
    expect(setSelectedProject).toHaveBeenCalledWith(project);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("opens a confirmation dialog instead of navigating while migrating", async () => {
    const user = userEvent.setup();
    render(<EnvironmentCard project={project} isMigrationOngoing />);
    await user.click(screen.getByText("Production"));
    expect(navigate).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Environment Migration in Progress"),
    ).toBeInTheDocument();
  });

  it("navigates after confirming the migration dialog", async () => {
    const user = userEvent.setup();
    render(<EnvironmentCard project={project} isMigrationOngoing />);
    await user.click(screen.getByText("Production"));
    await user.click(await screen.findByRole("button", { name: "Continue Anyway" }));
    expect(setSelectedProject).toHaveBeenCalledWith(project);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });
});
