import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

let tenantId = "tenant-1";
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId } }),
}));

const mutateAsync = vi.fn();
vi.mock("@blocks-idp/authentication/hooks/use-sso", () => ({
  useUpdateSsoCredentialStatus: () => ({ mutateAsync }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { SSoProviderStatusToggle } from "./sso-provider-status-toggle";

function renderToggle(configuration: Record<string, unknown>) {
  const setOpen = vi.fn();
  render(
    <SSoProviderStatusToggle open setOpen={setOpen} configuration={configuration as never} />,
  );
  return { setOpen };
}

afterEach(() => {
  vi.clearAllMocks();
  tenantId = "tenant-1";
});

describe("SSoProviderStatusToggle", () => {
  it("shows a disable prompt for an enabled provider", () => {
    renderToggle({ itemId: "s1", isDisabled: false });
    expect(screen.getByText("Disable")).toBeInTheDocument();
    expect(screen.getByText(/no longer be able to sign in/)).toBeInTheDocument();
  });

  it("shows an enable prompt for a disabled provider", () => {
    renderToggle({ itemId: "s1", isDisabled: true });
    expect(screen.getByText("Enable")).toBeInTheDocument();
    expect(screen.getByText(/available for user sign-in/)).toBeInTheDocument();
  });

  it("toggles the status and shows success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const { setOpen } = renderToggle({ itemId: "s1", isDisabled: false });
    await user.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        itemId: "s1",
        projectKey: "tenant-1",
        isEnabled: true,
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
  });

  it("shows an error toast when the item id is missing", async () => {
    const user = userEvent.setup();
    renderToggle({ itemId: "", isDisabled: false });
    await user.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows an error toast when the API reports failure", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { s: "bad" } });
    renderToggle({ itemId: "s1", isDisabled: true });
    await user.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { s: "bad" } }));
  });
});
