import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const saveConfig = vi.fn();
let rolesData: unknown;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@blocks-idp/iam/hooks/use-organization", () => ({
  useSaveOrganizationConfig: () => ({ mutateAsync: saveConfig, isPending: false }),
}));
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => ({ data: rolesData, isLoading: false }),
}));

import { OrganizationConfig } from "./organization-config";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

beforeEach(() => {
  vi.clearAllMocks();
  rolesData = { data: [{ name: "Admin", slug: "admin" }, { name: "Viewer", slug: "viewer" }] };
  saveConfig.mockResolvedValue({ isSuccess: true });
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Configure Organization/ }));
}

const config = {
  itemId: "cfg-1",
  isMultiOrgEnabled: false,
  allowCreationFromCloud: true,
  allowCreationFromConstruct: false,
  roles: [],
} as never;

describe("OrganizationConfig", () => {
  it("opens the dialog from the trigger", async () => {
    const user = userEvent.setup();
    render(<OrganizationConfig configData={config} isLoading={false} />);
    await openDialog(user);
    expect(await screen.findByText("Organization Configuration")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable Multi-Organization")).toBeInTheDocument();
  });

  it("shows a loading state while config is loading", async () => {
    const user = userEvent.setup();
    render(<OrganizationConfig configData={null} isLoading={true} />);
    await openDialog(user);
    expect(await screen.findByText("Loading...")).toBeInTheDocument();
  });

  it("reveals sub-options when multi-org is enabled", async () => {
    const user = userEvent.setup();
    render(<OrganizationConfig configData={config} isLoading={false} />);
    await openDialog(user);
    await user.click(screen.getByLabelText("Enable Multi-Organization"));
    expect(await screen.findByText("Allow Creation From Cloud")).toBeInTheDocument();
    expect(screen.getByText("Allow Creation From Construct")).toBeInTheDocument();
  });

  it("saves the configuration and shows success", async () => {
    const user = userEvent.setup();
    render(<OrganizationConfig configData={config} isLoading={false} />);
    await openDialog(user);
    // Toggle multi-org to make the form dirty and enable Save.
    await user.click(screen.getByLabelText("Enable Multi-Organization"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "cfg-1", isMultiOrgEnabled: true, projectKey: "tenant-1" }),
      ),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when saving fails", async () => {
    const user = userEvent.setup();
    saveConfig.mockResolvedValue({ isSuccess: false, errors: "bad" });
    render(<OrganizationConfig configData={config} isLoading={false} />);
    await openDialog(user);
    await user.click(screen.getByLabelText("Enable Multi-Organization"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });
});
