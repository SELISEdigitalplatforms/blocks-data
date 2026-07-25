import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyToClipboardButton } from "./copy-to-clipboard-button";

const setSecureContext = (value: boolean) => {
  Object.defineProperty(window, "isSecureContext", { value, writable: true, configurable: true });
};

beforeEach(() => {
  setSecureContext(true);
});
afterEach(() => vi.clearAllMocks());

describe("CopyToClipboardButton", () => {
  it("renders children and the copy control", () => {
    render(
      <CopyToClipboardButton textToCopy="secret">
        <span>Token</span>
      </CopyToClipboardButton>,
    );
    expect(screen.getByText("Token")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("copies via the clipboard API in a secure context", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true, configurable: true });
    render(
      <CopyToClipboardButton textToCopy="hello">
        <span>Token</span>
      </CopyToClipboardButton>,
    );
    await user.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand outside a secure context", async () => {
    const user = userEvent.setup();
    setSecureContext(false);
    const execCommand = vi.fn();
    Object.defineProperty(document, "execCommand", { value: execCommand, writable: true, configurable: true });
    render(
      <CopyToClipboardButton textToCopy="fallback" isHoverable>
        <span>Token</span>
      </CopyToClipboardButton>,
    );
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
  });
});
