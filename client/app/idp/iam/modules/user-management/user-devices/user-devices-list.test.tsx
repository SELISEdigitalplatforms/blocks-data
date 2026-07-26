import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserDevicesList } from "./user-devices-list";
import type { IDeviceSession } from "@blocks-idp/iam/models/user";

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

const session = (over: Partial<IDeviceSession> = {}): IDeviceSession =>
  ({
    IpAddresses: "10.0.0.1",
    IssuedUtc: past,
    ExpiresUtc: future,
    DeviceInformation: {
      Device: "desktop",
      Model: "",
      Browser: "Chrome",
      OS: "Linux",
    },
    ...over,
  }) as IDeviceSession;

describe("UserDevicesList", () => {
  it("renders a loading skeleton while loading", () => {
    const { container } = render(<UserDevicesList isLoading data={[]} />);
    expect(container.querySelectorAll(".rounded-xl").length).toBeGreaterThan(0);
  });

  it("shows the empty placeholder when there are no sessions", () => {
    render(<UserDevicesList isLoading={false} data={[]} />);
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("renders device details, IP and an active badge for a live session", () => {
    render(<UserDevicesList isLoading={false} data={[session()]} />);
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByText(/Desktop/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders an expired badge for an elapsed session", () => {
    render(
      <UserDevicesList isLoading={false} data={[session({ ExpiresUtc: past })]} />,
    );
    expect(screen.getByText("expired")).toBeInTheDocument();
  });

  it("falls back to Unknown labels when device info is missing", () => {
    render(
      <UserDevicesList
        isLoading={false}
        data={[
          session({ DeviceInformation: { Device: "", Model: "", Browser: "", OS: "" } as never }),
        ]}
      />,
    );
    expect(screen.getByText("Unknown Device")).toBeInTheDocument();
    expect(screen.getByText("Unknown Browser")).toBeInTheDocument();
  });
});
