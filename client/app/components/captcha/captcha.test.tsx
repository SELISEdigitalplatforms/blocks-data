import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./re-captcha", () => ({ ReCaptcha: () => <div data-testid="re-captcha" /> }));
vi.mock("./h-captcha", () => ({ HCaptcha: () => <div data-testid="h-captcha" /> }));

import { Captcha } from "./captcha";

describe("Captcha", () => {
  it("renders the reCaptcha implementation", () => {
    render(<Captcha type={"reCaptcha-v2-checkbox" as never} />);
    expect(screen.getByTestId("re-captcha")).toBeInTheDocument();
  });

  it("renders the hCaptcha implementation", () => {
    render(<Captcha type={"hCaptcha" as never} />);
    expect(screen.getByTestId("h-captcha")).toBeInTheDocument();
  });

  it("throws when no type is provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Captcha type={undefined as never} />)).toThrow(/type is not passed/);
    spy.mockRestore();
  });

  it("throws for an unsupported type", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Captcha type={"unknown" as never} />)).toThrow(/not supported/);
    spy.mockRestore();
  });
});
