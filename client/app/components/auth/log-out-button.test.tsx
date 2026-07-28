import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@/idp/authentication/hooks/use-auth", () => ({
  useLogout: () => ({ isPending, mutateAsync }),
}));

const queryClientClear = vi.fn();
vi.mock("@/providers/query-provider", () => ({
  getQueryClient: () => ({ clear: queryClientClear }),
}));

const resetSelectedLanguages = vi.fn();
vi.mock("@/store/use-language-view-store", () => ({
  useLanguageViewStore: () => ({ resetSelectedLanguages }),
}));

const setUnAuthenticated = vi.fn();
const clearTokens = vi.fn();
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => ({ setUnAuthenticated, clearTokens }),
}));

const resetProjectStore = vi.fn();
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ resetProjectStore }),
}));

import { LogOutButton } from "./log-out-button";

const replace = vi.fn();

beforeEach(() => {
  isPending = false;
  Object.defineProperty(window, "location", {
    value: { origin: "https://app.test", replace },
    writable: true,
    configurable: true,
  });
});
afterEach(() => vi.clearAllMocks());

describe("LogOutButton", () => {
  it("runs the full logout sequence on click", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(undefined);
    render(<LogOutButton />);

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(resetProjectStore).toHaveBeenCalled();
    expect(setUnAuthenticated).toHaveBeenCalled();
    expect(clearTokens).toHaveBeenCalled();
    expect(resetSelectedLanguages).toHaveBeenCalled();
    expect(queryClientClear).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("https://app.test/login");
  });

  it("logs the error and does not redirect when logout fails", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mutateAsync.mockRejectedValue(new Error("nope"));
    render(<LogOutButton />);

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("disables the button while the logout request is pending", () => {
    isPending = true;
    render(<LogOutButton />);
    expect(screen.getByRole("button", { name: "Logout" })).toBeDisabled();
  });
});
