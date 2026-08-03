import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (k: string) => `env:${k}`,
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("react-router", () => ({
  useLocation: () => ({ pathname: "/dashboard" }),
}));

import { BlocksAppLauncher } from "./blocks-app-launcher";

const setHref = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(window, "location", {
    value: { ...window.location, set href(v: string) { setHref(v); } },
    writable: true,
    configurable: true,
  });
});

describe("BlocksAppLauncher", () => {
  it("renders the default favourites in the launcher popover", async () => {
    const user = userEvent.setup();
    render(<BlocksAppLauncher />);
    await user.click(screen.getByRole("button", { name: "SELISE Blocks apps" }));
    expect(await screen.findByText("Your favourites")).toBeInTheDocument();
    // Defaults: IAM and Localization are favourites; others live under "More".
    expect(screen.getByText("IAM")).toBeInTheDocument();
    expect(screen.getByText("More from SELISE Blocks")).toBeInTheDocument();
  });

  it("reads favourites from localStorage when present", async () => {
    localStorage.setItem("blocks-app-favourites", JSON.stringify(["data"]));
    const user = userEvent.setup();
    render(<BlocksAppLauncher />);
    await user.click(screen.getByRole("button", { name: "SELISE Blocks apps" }));
    expect(await screen.findByText("Data")).toBeInTheDocument();
  });

  it("toggles a favourite from the edit dialog and persists it", async () => {
    const user = userEvent.setup();
    render(<BlocksAppLauncher />);
    await user.click(screen.getByRole("button", { name: "SELISE Blocks apps" }));
    await user.click(screen.getByRole("button", { name: "Edit favourites" }));
    expect(await screen.findByText("Manage Favourites")).toBeInTheDocument();

    // "Data" is not a default favourite; toggling it adds it to storage.
    const dataBtn = screen
      .getAllByRole("button", { pressed: false })
      .find((b) => b.textContent?.includes("Data"))!;
    await user.click(dataBtn);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("blocks-app-favourites") || "[]");
      expect(stored).toContain("data");
    });
  });

  it("initiates login and redirects when the API returns a redirect_uri", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ redirect_uri: "https://idp.example.com/auth" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<BlocksAppLauncher />);
    await user.click(screen.getByRole("button", { name: "SELISE Blocks apps" }));
    await user.click(await screen.findByRole("button", { name: /IAM/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(setHref).toHaveBeenCalledWith("https://idp.example.com/auth"));
    vi.unstubAllGlobals();
  });

  it("shows an error toast when no redirect_uri is returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) }),
    );
    const user = userEvent.setup();
    render(<BlocksAppLauncher />);
    await user.click(screen.getByRole("button", { name: "SELISE Blocks apps" }));
    await user.click(await screen.findByRole("button", { name: /IAM/ }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it("shows an error toast when the initiate request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const user = userEvent.setup();
    render(<BlocksAppLauncher />);
    await user.click(screen.getByRole("button", { name: "SELISE Blocks apps" }));
    await user.click(await screen.findByRole("button", { name: /IAM/ }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});
