import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

import { Logo } from "./index";

describe("Logo", () => {
  it("renders a single image when a src is provided", () => {
    render(<Logo src="/custom.svg" alt="Custom" />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "/custom.svg");
  });

  it("renders both light and dark default logos when no src is given", () => {
    render(<Logo />);
    const imgs = screen.getAllByAltText("SELISE Logo");
    expect(imgs).toHaveLength(2);
  });
});
