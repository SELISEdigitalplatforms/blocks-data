import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserHistoryList } from "./user-history-list";
import type { IHistories } from "@blocks-idp/iam/models/user";

const history = (over: Partial<IHistories> = {}): IHistories =>
  ({
    Event: "issued_refresh_token",
    LastUpdatedDate: new Date(Date.now() - 3600000).toISOString(),
    IpAddresses: "192.168.1.5",
    DeviceInformation: {
      Device: "mobile",
      Model: "pixel",
      Browser: "Firefox",
      OS: "Android",
    },
    ...over,
  }) as IHistories;

describe("UserHistoryList", () => {
  it("renders a loading skeleton while loading", () => {
    const { container } = render(<UserHistoryList isLoading data={[]} />);
    expect(container.querySelectorAll(".rounded-xl").length).toBeGreaterThan(0);
  });

  it("shows the empty placeholder when there is no history", () => {
    render(<UserHistoryList isLoading={false} data={[]} />);
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("maps the refresh-token event label and shows device details", () => {
    render(<UserHistoryList isLoading={false} data={[history()]} />);
    expect(screen.getByText("Refresh Token Issued")).toBeInTheDocument();
    expect(screen.getByText("192.168.1.5")).toBeInTheDocument();
    expect(screen.getByText(/Mobile Pixel/)).toBeInTheDocument();
  });

  it("maps the logout event label", () => {
    render(
      <UserHistoryList
        isLoading={false}
        data={[history({ Event: "revoke_access_by_logout" })]}
      />,
    );
    expect(screen.getByText("Access Revoked (Logout)")).toBeInTheDocument();
  });
});
