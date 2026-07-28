import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/get-api-path", () => ({
  getApiUrl: (base: string, path: string) => `https://api.example.com/${base}/${path}`,
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));

import { UrlWithActions } from "./url-with-actions";

const clickByTitle = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  const btn = document.querySelector(`button[title="${title}"]`) as HTMLElement;
  await user.click(btn);
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("UrlWithActions", () => {
  it("renders the certificate label", () => {
    render(<UrlWithActions url="https://files/cert.pem" />);
    expect(screen.getByText("certificate")).toBeInTheDocument();
  });

  it("copies the JWKS URL through the clipboard API in a secure context", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("isSecureContext", true);
    render(<UrlWithActions url="https://files/cert.pem" />);
    await clickByTitle(user, "Copy URL");
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://api.example.com/idp/v1/.well-known/jwks.json?X-Blocks-Key=tenant-abc",
      ),
    );
    vi.unstubAllGlobals();
  });

  it("falls back to execCommand when the clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", { clipboard: undefined });
    vi.stubGlobal("isSecureContext", false);
    const exec = vi.fn();
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    render(<UrlWithActions url="https://files/cert.pem" />);
    await clickByTitle(user, "Copy URL");
    await waitFor(() => expect(exec).toHaveBeenCalledWith("copy"));
    vi.unstubAllGlobals();
  });

  it("downloads the certificate through a blob URL", async () => {
    const blob = new Blob(["pem"]);
    global.fetch = vi.fn().mockResolvedValue({ blob: () => Promise.resolve(blob) }) as never;
    const createObjectURL = vi.fn().mockReturnValue("blob:abc");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const user = userEvent.setup();
    render(<UrlWithActions url="https://files/cert.pem" />);
    await clickByTitle(user, "Download certificate");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("https://files/cert.pem"));
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:abc");
  });
});
