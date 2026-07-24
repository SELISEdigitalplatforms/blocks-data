import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@blocks-idp/authentication/pages/auth-logs", () => ({
  AuthLogs: () => <div>auth-logs-child</div>,
}));

import AuthLogsPage from "./auth-logs";

describe("dashboard/auth-logs AuthLogsPage", () => {
  it("renders its AuthLogs child", () => {
    render(<AuthLogsPage />);
    expect(screen.getByText("auth-logs-child")).toBeInTheDocument();
  });
});
