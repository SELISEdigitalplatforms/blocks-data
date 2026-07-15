import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInput } from "./search-input";

describe("FilterToolbar SearchInput", () => {
  it("debounces onChange until typing settles", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} value="" />);
    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "abc");
    // The controlled input mirrors typing immediately via internal state.
    expect(input).toHaveValue("abc");
    // But onChange is debounced (300ms).
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("abc"));
  });

  it("clears immediately (bypassing the debounce) on clear click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} value="seed" />);
    await user.click(screen.getByRole("button"));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("");
  });

  it("syncs internal state when the value prop changes", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput onChange={onChange} value="one" />);
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("one");
    rerender(<SearchInput onChange={onChange} value="two" />);
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("two");
  });
});
