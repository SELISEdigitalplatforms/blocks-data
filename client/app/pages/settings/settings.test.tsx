import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const useGetProjects = vi.fn();
const useUpdateTenantGroup = vi.fn();
vi.mock("@/hooks/use-project", () => ({
  useGetProjects: (...a: unknown[]) => useGetProjects(...a),
  useUpdateTenantGroup: (...a: unknown[]) => useUpdateTenantGroup(...a),
}));

const setSelectedProject = vi.fn();
let selectedProject: Record<string, unknown> = { itemId: "p1", name: "Proj" };
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({
    selectedProject,
    selectedTenantGroup: "g1",
    setSelectedProject,
  }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { SettingsPage } from "./settings";

const loaded = (name = "Proj") => ({
  data: [{ projects: [{ itemId: "p1", name, createdDate: "2024-01-01" }] }],
  isLoading: false,
});

afterEach(() => {
  vi.clearAllMocks();
  selectedProject = { itemId: "p1", name: "Proj" };
});

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

  it("saves an edited project name and shows a success toast", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    useGetProjects.mockReturnValue(loaded());
    useUpdateTenantGroup.mockReturnValue({ mutateAsync, isPending: false });

    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Edit project name" }));
    const input = await screen.findByLabelText("Project name");
    await user.clear(input);
    await user.type(input, "Renamed Project");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        name: "Renamed Project",
        tenantGroupId: "g1",
      }),
    );
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("shows a destructive toast when the update returns errors", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ errors: { name: "bad" } });
    useGetProjects.mockReturnValue(loaded());
    useUpdateTenantGroup.mockReturnValue({ mutateAsync, isPending: false });

    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Edit project name" }));
    await user.type(await screen.findByLabelText("Project name"), "X");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });

  it("shows a destructive toast when the update throws", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockRejectedValue(new Error("boom"));
    useGetProjects.mockReturnValue(loaded());
    useUpdateTenantGroup.mockReturnValue({ mutateAsync, isPending: false });

    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Edit project name" }));
    await user.type(await screen.findByLabelText("Project name"), "Y");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });

  it("syncs the selected project into the store when the fetched name differs", () => {
    selectedProject = { itemId: "p1", name: "Old Name" };
    useGetProjects.mockReturnValue(loaded("Fresh Name"));
    useUpdateTenantGroup.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    render(<SettingsPage />);
    expect(setSelectedProject).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "p1", name: "Fresh Name" }),
    );
  });
});
