import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const navigate = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/components/copy-to-clipboard-button", () => ({
  CopyToClipboardButton: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { LogItem } from "./log-item";
import { ILog } from "../../models/log.model";

const log: ILog = {
  timestamp: "2026-07-30T10:15:00Z",
  level: "error",
  message: "Something went wrong",
  traceId: "trace-42",
} as ILog;

const renderItem = (overrides: Partial<ILog> = {}) =>
  render(<LogItem log={{ ...log, ...overrides }} />);

describe("LogItem", () => {
  beforeEach(() => navigate.mockReset());

  it("renders the level, message and trace id", () => {
    renderItem();
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("[trace-42]")).toBeInTheDocument();
  });

  it("navigates to the trace timeline when the trace id is clicked", async () => {
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByText("[trace-42]"));

    expect(navigate).toHaveBeenCalledWith("/tracing/timeline/trace-42");
  });

  it.each([["{Enter}"], [" "]])(
    "navigates to the trace timeline when %s is pressed on the trace id",
    async (key) => {
      const user = userEvent.setup();
      renderItem();

      screen.getByRole("button").focus();
      await user.keyboard(key);

      expect(navigate).toHaveBeenCalledWith("/tracing/timeline/trace-42");
    },
  );

  it("ignores other keys on the trace id", async () => {
    const user = userEvent.setup();
    renderItem();

    screen.getByRole("button").focus();
    await user.keyboard("{Escape}");

    expect(navigate).not.toHaveBeenCalled();
  });
});
