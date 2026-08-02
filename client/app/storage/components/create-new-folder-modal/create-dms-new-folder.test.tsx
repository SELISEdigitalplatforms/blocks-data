import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const createDmsFolderMutate = vi.fn();

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@/storage/hooks/use-dms", () => ({
  useCreateDmsFolder: () => ({ mutateAsync: createDmsFolderMutate, isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { CreateDmsNewFolder } from "./create-dms-new-folder";

const props = () => ({
  open: true,
  onOpenChange: vi.fn(),
  parentId: "parent-1",
  configurationName: "docs",
  onSuccess: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  createDmsFolderMutate.mockResolvedValue({ folderId: "new-folder" });
});

describe("CreateDmsNewFolder", () => {
  it("renders the folder name field", () => {
    render(<CreateDmsNewFolder {...props()} />);
    expect(screen.getByText("Create Folder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter folder name")).toBeInTheDocument();
  });

  it("keeps Create disabled until a name is entered", async () => {
    const user = userEvent.setup();
    render(<CreateDmsNewFolder {...props()} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Enter folder name"), "Reports");
    await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeEnabled());
  });

  it("creates the folder with the expected payload and reports success", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<CreateDmsNewFolder {...p} />);
    await user.type(screen.getByPlaceholderText("Enter folder name"), "Reports");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createDmsFolderMutate).toHaveBeenCalledTimes(1));
    const payload = createDmsFolderMutate.mock.calls[0][0];
    expect(payload.name).toBe("Reports");
    expect(payload.parentDirectoryId).toBe("parent-1");
    expect(payload.configurationName).toBe("docs");
    expect(payload.projectKey).toBe("tenant-abc");
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "Folder created successfully." });
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(p.onSuccess).toHaveBeenCalled();
  });

  it("shows an error toast when the creation throws", async () => {
    createDmsFolderMutate.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<CreateDmsNewFolder {...props()} />);
    await user.type(screen.getByPlaceholderText("Enter folder name"), "Reports");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
