import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let sessions: { data: unknown[]; totalCount: number } | undefined;
vi.mock("@blocks-idp/iam/hooks/use-activity", () => ({
  useGetSessions: () => ({ isLoading: false, isFetching: false, data: sessions }),
}));
vi.mock("./user-devices-list", () => ({
  UserDevicesList: () => <div data-testid="devices-list" />,
}));
vi.mock("@/components/ui-kits/pagination/pagination", () => ({
  Pagination: () => <div data-testid="pagination" />,
}));

import { UserDevices } from "./user-devices";

afterEach(() => vi.clearAllMocks());

describe("UserDevices", () => {
  it("renders the devices list without pagination when there is a single page", () => {
    sessions = { data: [{ id: "d1" }], totalCount: 5 };
    render(<UserDevices id="u1" projectKey="t1" />);
    expect(screen.getByTestId("devices-list")).toBeInTheDocument();
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });

  it("shows pagination when the total count exceeds the page size", () => {
    sessions = { data: [{ id: "d1" }], totalCount: 25 };
    render(<UserDevices id="u1" projectKey="t1" />);
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
  });
});
