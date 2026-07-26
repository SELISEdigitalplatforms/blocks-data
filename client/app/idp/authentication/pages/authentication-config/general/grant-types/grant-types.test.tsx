import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const mutateAsync = vi.fn();
let isErr = false;
let authData: unknown;
let isLoading = false;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc", itemId: "p1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@blocks-idp/authentication/hooks/use-auth-config", () => ({
  useGetAuthConfig: () => ({ data: authData, isLoading }),
  useSaveAuthConfig: () => ({ mutateAsync, isPending: false }),
}));

import { GrantTypes } from "./grant-types";

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  isLoading = false;
  authData = { allowedGrantTypes: ["password"] };
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("GrantTypes", () => {
  it("renders skeletons while loading", () => {
    isLoading = true;
    const { container } = render(<GrantTypes />);
    expect(container.querySelectorAll(".animate-pulse, [class*='aspect-square']").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("renders every grant-type option", () => {
    render(<GrantTypes />);
    expect(screen.getByText("Email/Password")).toBeInTheDocument();
    expect(screen.getByText("SSO")).toBeInTheDocument();
    expect(screen.getByText("Client Credential")).toBeInTheDocument();
    expect(screen.getByText("Authorization Code")).toBeInTheDocument();
  });

  it("keeps Save disabled until a change is made", () => {
    render(<GrantTypes />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the updated grant types", async () => {
    const user = userEvent.setup();
    render(<GrantTypes />);
    // Options render in order; index 1 is SSO (social).
    await user.click(screen.getAllByRole("checkbox")[1]);
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.allowedGrantTypes).toEqual(["password", "social"]);
    expect(payload.projectKey).toBe("tenant-abc");
    expect(showSuccessToast).toHaveBeenCalledWith({
      description: "Grant types updated successfully",
    });
  });

  it("shows an error toast when the save is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<GrantTypes />);
    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });
});
