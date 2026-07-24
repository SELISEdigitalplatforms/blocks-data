import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-organization", () => ({
  useSaveOrganization: () => ({ mutateAsync, isPending }),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { ToggleOrganizationStatus } from "./toggle-organization-status";

const org = { itemId: "o1", name: "Acme", isEnable: true } as never;

function renderComp(organization = org) {
  const onClose = vi.fn();
  render(
    <Dialog open>
      <ToggleOrganizationStatus organization={organization} onClose={onClose} />
    </Dialog>,
  );
  return { onClose };
}

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

describe("ToggleOrganizationStatus", () => {
  it("renders a disable prompt for an enabled organization", () => {
    renderComp();
    expect(screen.getByText("Disable Organization")).toBeInTheDocument();
    expect(screen.getByText(/make it inactive/)).toBeInTheDocument();
  });

  it("renders an enable prompt for a disabled organization", () => {
    renderComp({ itemId: "o1", name: "Acme", isEnable: false } as never);
    expect(screen.getByText("Enable Organization")).toBeInTheDocument();
    expect(screen.getByText(/make it active again/)).toBeInTheDocument();
  });

  it("disables the org and shows success, then closes", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const { onClose } = renderComp();
    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectKey: "tenant-1",
        name: "Acme",
        itemId: "o1",
        isEnable: false,
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows an error toast when the API reports failure", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { name: "bad" } });
    renderComp();
    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { name: "bad" } }));
  });

  it("shows an error toast when the request throws an errors object", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue({ errors: { name: "boom" } });
    renderComp();
    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { name: "boom" } }));
  });
});
