import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetDataServiceConfiguration = vi.fn();

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (key: string) =>
    key === "BLOCKS_GRAPHQL_PUBLIC_URL" ? "https://dev-api.blocksdevelopers.com/data/v4/gateway" : "",
}));
vi.mock("../../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => useGetDataServiceConfiguration(),
}));

import { EndpointChip } from "./endpoint-chip";

/** jsdom exposes navigator.clipboard as a getter-only property. */
const stubClipboard = (writeText: () => Promise<void>) =>
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

describe("EndpointChip", () => {
  beforeEach(() => {
    useGetDataServiceConfiguration.mockReturnValue({
      data: { data: { isActive: true, databaseName: "dev-data" } },
    });
  });

  // The proxy path (`/api/gateway`) isn't reachable from outside the app, so
  // showing it (and copying it) was pointing people at an address that
  // doesn't work in a curl call or another client — the short label here is
  // just a hint of what the chip is about, not the address itself.
  it("shows only the short gateway label, not the database name or the proxy path", () => {
    render(<EndpointChip />);

    expect(screen.getByText("/gateway")).toBeInTheDocument();
    expect(screen.queryByText(/dev-data/)).not.toBeInTheDocument();
    expect(screen.queryByText("/api/gateway")).not.toBeInTheDocument();
  });

  it("names the connected database in the chip's tooltip instead", () => {
    render(<EndpointChip />);
    expect(screen.getByTitle("Connected to dev-data")).toBeInTheDocument();
  });

  it("copies the real public endpoint, not the app's own proxy path", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<EndpointChip />);

    await user.click(screen.getByRole("button", { name: "Copy endpoint" }));

    expect(writeText).toHaveBeenCalledWith("https://dev-api.blocksdevelopers.com/data/v4/gateway");
    expect(await screen.findByRole("button", { name: "Endpoint copied" })).toBeInTheDocument();
  });

  // Clipboard access is denied on insecure origins; the endpoint is still on
  // screen, so the chip must not blow up.
  it("survives a rejected clipboard write", async () => {
    const user = userEvent.setup();
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    render(<EndpointChip />);

    await user.click(screen.getByRole("button", { name: "Copy endpoint" }));

    expect(screen.getByRole("button", { name: "Copy endpoint" })).toBeInTheDocument();
  });
});
