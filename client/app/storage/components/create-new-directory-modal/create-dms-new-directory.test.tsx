import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const createDmsDirectoryMutate = vi.fn();

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@/storage/hooks/use-dms", () => ({
  useCreateDmsDirectory: () => ({ mutateAsync: createDmsDirectoryMutate, isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { CreateDmsNewDirectory } from "./create-dms-new-directory";

const props = () => ({
  open: true,
  onOpenChange: vi.fn(),
  parentId: "parent-1",
  configurationName: "docs",
  onSuccess: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  createDmsDirectoryMutate.mockResolvedValue({ directoryId: "new-directory" });
});

describe("CreateDmsNewDirectory", () => {
  it("renders the directory name field", () => {
    render(<CreateDmsNewDirectory {...props()} />);
    expect(screen.getByText("Create Directory")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter directory name")).toBeInTheDocument();
  });

  it("keeps Create disabled until a name is entered", async () => {
    const user = userEvent.setup();
    render(<CreateDmsNewDirectory {...props()} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Enter directory name"), "Reports");
    await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeEnabled());
  });

  it("creates the directory with the expected payload and reports success", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<CreateDmsNewDirectory {...p} />);
    await user.type(screen.getByPlaceholderText("Enter directory name"), "Reports");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createDmsDirectoryMutate).toHaveBeenCalledTimes(1));
    const payload = createDmsDirectoryMutate.mock.calls[0][0];
    expect(payload.name).toBe("Reports");
    expect(payload.parentDirectoryId).toBe("parent-1");
    expect(payload.configurationName).toBe("docs");
    expect(payload.projectKey).toBe("tenant-abc");
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "Directory created successfully." });
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(p.onSuccess).toHaveBeenCalled();
  });

  it("shows an error toast when the creation throws", async () => {
    createDmsDirectoryMutate.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<CreateDmsNewDirectory {...props()} />);
    await user.type(screen.getByPlaceholderText("Enter directory name"), "Reports");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
