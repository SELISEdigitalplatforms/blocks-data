import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/iam/modules/user-management", () => ({
  IamLogs: () => <div>iam-logs-child</div>,
}));

import IamLogsPage from "./iam-logs";

describe("dashboard/iam-logs IamLogsPage", () => {
  it("renders its IamLogs child", () => {
    render(<IamLogsPage />);
    expect(screen.getByText("iam-logs-child")).toBeInTheDocument();
  });
});
