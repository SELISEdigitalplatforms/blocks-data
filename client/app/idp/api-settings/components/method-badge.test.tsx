import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MethodBadge } from "./method-badge";

describe("MethodBadge", () => {
  it("uppercases and styles a known method", () => {
    render(<MethodBadge method="get" />);
    const badge = screen.getByText("GET");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("emerald");
  });

  it("renders the DELETE style", () => {
    render(<MethodBadge method="DELETE" />);
    expect(screen.getByText("DELETE").className).toContain("red");
  });

  it("falls back to a neutral style for unknown or missing methods", () => {
    const { container } = render(<MethodBadge />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-muted");
  });
});
