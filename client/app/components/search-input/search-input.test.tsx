import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInput } from "./search-input";

describe("SearchInput", () => {
  it("calls onSearch on every keystroke", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const setIsVisible = vi.fn();
    render(
      <SearchInput
        onSearch={onSearch}
        value=""
        isVisible
        setIsVisible={setIsVisible}
      />,
    );
    await user.type(screen.getByPlaceholderText("Search..."), "a");
    expect(onSearch).toHaveBeenCalledWith("a");
  });

  it("renders a clear button only when there is a value and clears on click", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const setIsVisible = vi.fn();
    const { rerender } = render(
      <SearchInput
        onSearch={onSearch}
        value=""
        isVisible
        setIsVisible={setIsVisible}
      />,
    );
    // no value -> no clear button
    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <SearchInput
        onSearch={onSearch}
        value="term"
        isVisible
        setIsVisible={setIsVisible}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("collapses to a toggle button when toggleable and not visible", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const setIsVisible = vi.fn();
    render(
      <SearchInput
        onSearch={onSearch}
        value=""
        toggleable
        isVisible={false}
        setIsVisible={setIsVisible}
      />,
    );
    // input hidden, only the toggle button is shown
    expect(screen.queryByPlaceholderText("Search...")).toBeNull();
    await user.click(screen.getByRole("button"));
    expect(setIsVisible).toHaveBeenCalledWith(true);
  });

  it("hides the field on clear when toggleable", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const setIsVisible = vi.fn();
    render(
      <SearchInput
        onSearch={onSearch}
        value="term"
        toggleable
        isVisible
        setIsVisible={setIsVisible}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onSearch).toHaveBeenCalledWith("");
    expect(setIsVisible).toHaveBeenCalledWith(false);
  });
});
