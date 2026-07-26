import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// react-syntax-highlighter pulls in a large refractor dependency; stub it to a
// simple element so the test stays fast and deterministic.
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: React.ReactNode }) => <pre>{children}</pre>,
}));

import { CopyableSnippet } from "./copyable-snippet";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

describe("CopyableSnippet", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the trimmed code", () => {
    render(<CopyableSnippet code="  npm install  " isCopyable />);
    expect(screen.getByText("npm install")).toBeInTheDocument();
  });

  it("does not render the copy button when isCopyable is false", () => {
    render(<CopyableSnippet code="npm install" isCopyable={false} />);
    expect(screen.queryByRole("button", { name: /copy code/i })).toBeNull();
  });

  it("writes the untrimmed code to the clipboard when copied", async () => {
    const user = userEvent.setup();
    // Override the clipboard AFTER userEvent.setup(), which installs its own stub.
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CopyableSnippet code="npm run build" isCopyable />);

    await user.click(screen.getByRole("button", { name: /copy code/i }));
    expect(writeText).toHaveBeenCalledWith("npm run build");
  });

  it("logs an error when clipboard write fails", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard(writeText);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<CopyableSnippet code="fail" isCopyable />);
    await user.click(screen.getByRole("button", { name: /copy code/i }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
  });

  it("falls back to execCommand when the clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    // Remove the clipboard API installed by userEvent.setup() to force the fallback.
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const execCommand = vi.fn();
    (document as unknown as { execCommand: unknown }).execCommand = execCommand;

    render(<CopyableSnippet code="echo hi" isCopyable />);
    await user.click(screen.getByRole("button", { name: /copy code/i }));

    expect(execCommand).toHaveBeenCalledWith("copy");
    // The copied indicator flips on after the fallback succeeds.
    await waitFor(() =>
      expect(document.querySelector("svg.lucide-check")).toBeInTheDocument(),
    );
  });
});
