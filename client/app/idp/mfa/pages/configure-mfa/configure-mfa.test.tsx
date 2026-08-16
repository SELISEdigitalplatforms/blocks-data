import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const saveMFA = vi.fn();
let mfaData: unknown;
let isLoading = false;
let isFetching = false;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("../../hooks/use-mfa-config", () => ({
  useGetMFAConfig: () => ({ data: mfaData, isLoading, isFetching }),
  useSaveMFAConfig: () => ({ mutateAsync: saveMFA, isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/components/confirmation-modal/confirmation-modal", () => ({
  default: (props: { data: { dialogSubtitle?: string }; onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="confirm-modal">
      <p>{props.data.dialogSubtitle}</p>
      <button onClick={props.onConfirm}>confirm</button>
      <button onClick={props.onCancel}>cancel</button>
    </div>
  ),
}));

import { ConfigureMFA } from "./configure-mfa";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

beforeEach(() => {
  vi.clearAllMocks();
  isLoading = false;
  isFetching = false;
  mfaData = { userMfaType: [] };
  saveMFA.mockResolvedValue({ isSuccess: true });
});

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, rowIndex: number) {
  const triggers = screen.getAllByRole("button");
  // Each provider row has exactly one menu trigger button.
  await user.click(triggers[rowIndex]);
}

describe("ConfigureMFA", () => {
  it("shows loading skeletons while fetching", () => {
    isLoading = true;
    const { container } = render(<ConfigureMFA />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders a provider row per MFA method with the correct status", () => {
    mfaData = { userMfaType: [2] };
    render(<ConfigureMFA />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Authenticator app")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("shows the empty state when there is no config data", () => {
    mfaData = null;
    render(<ConfigureMFA />);
    expect(
      screen.getByText(/MFA is not yet configured for this project/),
    ).toBeInTheDocument();
  });

  it("enables a provider and saves the updated config", async () => {
    const user = userEvent.setup();
    mfaData = { userMfaType: [] };
    render(<ConfigureMFA />);
    await openRowMenu(user, 0);
    await user.click(await screen.findByText("Enable"));
    await user.click(await screen.findByText("confirm"));
    await waitFor(() =>
      expect(saveMFA).toHaveBeenCalledWith({
        projectKey: "tenant-1",
        enableMfa: true,
        userMfaType: [2],
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("disables a provider and saves the updated config", async () => {
    const user = userEvent.setup();
    mfaData = { userMfaType: [2] };
    render(<ConfigureMFA />);
    await openRowMenu(user, 0);
    await user.click(await screen.findByText("Disable"));
    await user.click(await screen.findByText("confirm"));
    await waitFor(() =>
      expect(saveMFA).toHaveBeenCalledWith({
        projectKey: "tenant-1",
        enableMfa: false,
        userMfaType: [],
      }),
    );
  });

  it("surfaces an error toast when saving fails", async () => {
    const user = userEvent.setup();
    saveMFA.mockResolvedValue({ isSuccess: false, errors: "save failed" });
    mfaData = { userMfaType: [] };
    render(<ConfigureMFA />);
    await openRowMenu(user, 0);
    await user.click(await screen.findByText("Enable"));
    await user.click(await screen.findByText("confirm"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "save failed" }),
    );
  });
});
