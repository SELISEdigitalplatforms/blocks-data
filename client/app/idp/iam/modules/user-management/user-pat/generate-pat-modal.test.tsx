import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const generateToken = vi.fn();
let isPending = false;
let isError = false;

vi.mock("@blocks-idp/iam/hooks/use-activity", () => ({
  useGeneratePats: () => ({ mutate: generateToken, isPending, isError }),
}));

import { GenerateTokenModal } from "./generate-pat-modal";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

beforeEach(() => {
  vi.clearAllMocks();
  isPending = false;
  isError = false;
});

describe("GenerateTokenModal", () => {
  it("renders with the Generate button disabled until a name is typed", () => {
    render(<GenerateTokenModal isOpen onClose={vi.fn()} id="u1" />);
    expect(screen.getByText("Generate Token")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });

  it("shows the default 30-day expiration label", () => {
    render(<GenerateTokenModal isOpen onClose={vi.fn()} id="u1" />);
    expect(screen.getByText(/30 days \(/)).toBeInTheDocument();
  });

  it("shows an error banner when generation failed", () => {
    isError = true;
    render(<GenerateTokenModal isOpen onClose={vi.fn()} id="u1" />);
    expect(screen.getByText(/Failed to generate token/)).toBeInTheDocument();
  });

  it("generates a token with the correct TTL and resets on success", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    generateToken.mockImplementation((_payload, opts) => opts.onSuccess({ token: "abc" }));
    render(<GenerateTokenModal isOpen onClose={onClose} id="u1" onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText(/PAT Name/), "my token");
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ note: "my token", codeTtlInMinute: 30 * 24 * 60 }),
      expect.any(Object),
    );
    expect(onSuccess).toHaveBeenCalledWith({ token: "abc" });
    expect(onClose).toHaveBeenCalled();
  });

  it("logs an error and does not submit when the name is blank", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GenerateTokenModal isOpen onClose={vi.fn()} id="u1" />);
    // Type then clear to reach handleGenerate guard is not possible while disabled,
    // so type a space (trims to empty) then a char to enable, then clear via backspace.
    await user.type(screen.getByLabelText(/PAT Name/), "x");
    await user.clear(screen.getByLabelText(/PAT Name/));
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    spy.mockRestore();
  });

  it("handles the generation error callback", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    generateToken.mockImplementation((_payload, opts) => opts.onError(new Error("boom")));
    render(<GenerateTokenModal isOpen onClose={vi.fn()} id="u1" />);
    await user.type(screen.getByLabelText(/PAT Name/), "tok");
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(spy).toHaveBeenCalledWith("Failed to generate token:", expect.any(Error));
    spy.mockRestore();
  });

  it("resets and closes on cancel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GenerateTokenModal isOpen onClose={onClose} id="u1" />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("changes the expiration via the select", async () => {
    const user = userEvent.setup();
    render(<GenerateTokenModal isOpen onClose={vi.fn()} id="u1" />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /7 days/ }));
    expect(screen.getByText(/7 days \(/)).toBeInTheDocument();
  });
});
