import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetDataServiceConfiguration = vi.fn();

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "http://api/" }));
vi.mock("../../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => useGetDataServiceConfiguration(),
}));

import { EndpointChip, gatewayEndpointUrl } from "./endpoint-chip";

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

  it("builds an absolute endpoint without doubling the slash", () => {
    expect(gatewayEndpointUrl()).toBe("http://api/api/gateway");
  });

  it("shows the endpoint path and the connected database", () => {
    render(<EndpointChip />);

    expect(screen.getByText("/api/gateway · dev-data")).toBeInTheDocument();
  });

  it("omits the database until the configuration resolves", () => {
    useGetDataServiceConfiguration.mockReturnValue({ data: undefined });
    render(<EndpointChip />);

    expect(screen.getByText("/api/gateway")).toBeInTheDocument();
  });

  it("copies the absolute endpoint and acknowledges it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<EndpointChip />);

    await user.click(screen.getByRole("button", { name: "Copy endpoint" }));

    expect(writeText).toHaveBeenCalledWith("http://api/api/gateway");
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
