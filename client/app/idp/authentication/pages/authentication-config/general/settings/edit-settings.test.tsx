import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const mutateAsync = vi.fn();
let isErr = false;
let authData: unknown;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/authentication/hooks/use-auth-config", () => ({
  useGetAuthConfig: () => ({ data: authData }),
  useSaveAuthConfig: () => ({ mutateAsync, isPending: false }),
}));

import { EditGeneralSettings } from "./edit-settings";

const validConfig = {
  refreshTokenValidForNumberMinutes: 120,
  getNumberOfWrongAttemptsToLockTheAccount: 5,
  accountLockDurationInMinutes: 15,
  accessTokenValidForNumberMinutes: 30,
  rememberMeRefreshTokenValidForNumberMinutes: 240,
};

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Edit/ }));
  await screen.findByText("Settings");
}

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  authData = { ...validConfig };
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("EditGeneralSettings", () => {
  it("renders the trigger", () => {
    render(<EditGeneralSettings />);
    expect(screen.getByRole("button", { name: /Edit/ })).toBeInTheDocument();
  });

  it("prefills the token validity fields from the fetched config", async () => {
    const user = userEvent.setup();
    render(<EditGeneralSettings />);
    await open(user);
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("120")).toBeInTheDocument();
  });

  it("keeps Save disabled until a field changes", async () => {
    const user = userEvent.setup();
    render(<EditGeneralSettings />);
    await open(user);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the merged configuration and reports success", async () => {
    const user = userEvent.setup();
    render(<EditGeneralSettings />);
    await open(user);
    const access = screen.getByDisplayValue("30");
    await user.clear(access);
    await user.type(access, "45");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.accessTokenValidForNumberMinutes).toBe(45);
    expect(payload.projectKey).toBe("tenant-abc");
    expect(showSuccessToast).toHaveBeenCalledWith({
      description: "Configuration updated successfully",
    });
  });

  it("shows an error toast when the save is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<EditGeneralSettings />);
    await open(user);
    const access = screen.getByDisplayValue("30");
    await user.clear(access);
    await user.type(access, "45");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });
});
