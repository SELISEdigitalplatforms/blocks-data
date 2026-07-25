import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropdownSearchInput } from "./dropdown-search-input";

const options = [
  { label: "Name", value: "name" },
  { label: "Email", value: "email" },
];

afterEach(() => vi.clearAllMocks());

describe("DropdownSearchInput", () => {
  it("renders the input with the placeholder and current value", () => {
    render(
      <DropdownSearchInput
        onChange={vi.fn()}
        placeholder="Find"
        value={{ selected: "name", value: "abc" }}
        options={options}
      />,
    );
    const input = screen.getByPlaceholderText("Find") as HTMLInputElement;
    expect(input.value).toBe("abc");
  });

  it("updates the input value while typing", async () => {
    const user = userEvent.setup();
    render(
      <DropdownSearchInput onChange={vi.fn()} value={{ selected: "name", value: "" }} options={options} />,
    );
    const input = screen.getByPlaceholderText("Search...") as HTMLInputElement;
    await user.type(input, "hi");
    expect(input.value).toBe("hi");
  });

  it("clears the value and notifies the parent immediately", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DropdownSearchInput onChange={onChange} value={{ selected: "name", value: "abc" }} options={options} />,
    );
    const clearButton = screen.getAllByRole("button").find((b) => !b.hasAttribute("aria-expanded"));
    await user.click(clearButton as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ selected: "name", value: "" });
  });

  it("changes the selected option through the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DropdownSearchInput onChange={onChange} value={{ selected: "name", value: "" }} options={options} />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Email"));
    expect(onChange).toHaveBeenCalledWith({ selected: "email", value: "" });
  });
});
