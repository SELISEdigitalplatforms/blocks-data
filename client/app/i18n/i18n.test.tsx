import { useAppSettingsStore } from "@seliseblocks/genesis-os/store";
import { useI18nStore } from "@seliseblocks/genesis-os/i18n";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: "light" }),
}));

import { ModeToggle } from "@/components/mode-toggle/mode-toggle";

afterEach(() => {
  act(() => useAppSettingsStore.getState().setSettings({ language: "en" }));
});

describe("language switch", () => {
  it("shows English by default", () => {
    render(<ModeToggle />);
    expect(screen.getByText("Toggle theme")).toBeInTheDocument();
  });

  it("shows another language's text once it comes from the localization service and that language is selected", () => {
    render(<ModeToggle />);
    act(() => {
      useI18nStore.getState().setRemote("xx", "data.shared", { "MODE_TOGGLE.TOGGLE_THEME": "[xx] Toggle theme" });
      useAppSettingsStore.getState().setSettings({ language: "xx" });
    });
    expect(screen.getByText("[xx] Toggle theme")).toBeInTheDocument();
  });
});
