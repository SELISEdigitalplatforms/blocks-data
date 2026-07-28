import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorSwatch, validHexaColorReg } from "./color-swatch";

describe("validHexaColorReg", () => {
  it.each(["#FFF", "#FFFF", "#FFFFFF", "#FFFFFFFF", "#a1b2c3"])(
    "accepts valid hex color %s",
    (value) => {
      expect(validHexaColorReg.test(value)).toBe(true);
    },
  );

  it.each(["FFFFFF", "#FF", "#12345", "#GGGGGG", "red"])(
    "rejects invalid hex color %s",
    (value) => {
      expect(validHexaColorReg.test(value)).toBe(false);
    },
  );
});

describe("ColorSwatch", () => {
  it("renders the value uppercased in the text input", () => {
    render(<ColorSwatch value="#abcdef" />);
    expect(screen.getByRole("textbox")).toHaveValue("#ABCDEF");
  });

  it("uppercases and strips invalid characters on text change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorSwatch value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "z");
    // "z" is not a valid hex char and gets stripped -> empty string emitted
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("keeps valid hex characters and uppercases them", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorSwatch value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "a");
    expect(onChange).toHaveBeenLastCalledWith("A");
  });

  it("collapses multiple hash characters into a single leading hash", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorSwatch value="#" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    // typing another '#' after existing '#'
    await user.type(input, "#");
    expect(onChange).toHaveBeenLastCalledWith("#");
  });

  it("applies the error border class when hasError is set", () => {
    const { container } = render(<ColorSwatch value="#FFFFFF" hasError />);
    expect(container.querySelector(".border-destructive")).not.toBeNull();
  });
});
