import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const mutateAsync = vi.fn();
let isErr = false;
let configData: unknown;
let isLoading = false;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-iam-configuration", () => ({
  useGetIamConfiguration: () => ({ isLoading, data: configData }),
  useSaveIamConfiguration: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/components/breadcrumb/breadcrumb", () => ({ default: () => <nav>breadcrumb</nav> }));

import { Configure } from "./configure";

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  isLoading = false;
  configData = {
    data: {
      accountActivationUrl: "https://a.example.com",
      accountVerificationUrl: "https://v.example.com",
      recoverAccountUrl: "https://r.example.com",
      activationUrlLifetimeInMinutes: 30,
      recoverAccountUrlLifetimeInMinutes: 60,
      logoutOnPasswordChange: true,
    },
  };
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("Configure", () => {
  it("renders a loading skeleton while loading", () => {
    isLoading = true;
    const { container } = render(<Configure />);
    expect(container.querySelectorAll(".h-10").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Change/ })).not.toBeInTheDocument();
  });

  it("prefills the form from the fetched configuration", () => {
    render(<Configure />);
    expect(screen.getByDisplayValue("https://a.example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://v.example.com")).toBeInTheDocument();
  });

  it("keeps Change disabled until the form is dirty", () => {
    render(<Configure />);
    expect(screen.getByRole("button", { name: /Change/ })).toBeDisabled();
  });

  it("saves the edited configuration and reports success", async () => {
    const user = userEvent.setup();
    render(<Configure />);
    const input = screen.getByDisplayValue("https://a.example.com");
    await user.clear(input);
    await user.type(input, "https://new.example.com");
    await user.click(screen.getByRole("button", { name: /Change/ }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.accountActivationUrl).toBe("https://new.example.com");
    expect(payload.projectKey).toBe("tenant-abc");
    expect(showSuccessToast).toHaveBeenCalledWith({
      description: "Configuration updated successfully",
    });
  });

  it("shows an error toast when the save throws with an errors field", async () => {
    isErr = true;
    mutateAsync.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    render(<Configure />);
    const input = screen.getByDisplayValue("https://a.example.com");
    await user.clear(input);
    await user.type(input, "https://new.example.com");
    await user.click(screen.getByRole("button", { name: /Change/ }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });
});
