import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.fn();
let resolvedTheme = "light";
vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ setTheme, resolvedTheme }),
}));

import { ModeToggle } from "./mode-toggle";

afterEach(() => {
  vi.clearAllMocks();
  resolvedTheme = "light";
});

describe("ModeToggle", () => {
  it("switches to dark when currently light", () => {
    resolvedTheme = "light";
    render(<ModeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches to light when currently dark", () => {
    resolvedTheme = "dark";
    render(<ModeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(setTheme).toHaveBeenCalledWith("light");
  });
});
