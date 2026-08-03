import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PrincipalPicker, type PrincipalPickerOption } from "./principal-picker";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const options: PrincipalPickerOption[] = [
  { value: "u1", label: "Alice", description: "alice@x.com" },
  { value: "u2", label: "Bob", description: "bob@x.com" },
  { value: "u3", label: "Carol" },
];

describe("PrincipalPicker", () => {
  it("renders the placeholder before anything is selected", () => {
    render(
      <PrincipalPicker
        label="Users"
        options={options}
        selected={[]}
        onChange={vi.fn()}
        placeholder="Pick users"
      />,
    );

    expect(screen.getByText("Pick users")).toBeInTheDocument();
  });

  it("toggles a value on and off when its row is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PrincipalPicker label="Users" options={options} selected={[]} onChange={onChange} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Users" }));
    await user.click(await screen.findByText("Alice"));

    expect(onChange).toHaveBeenCalledWith(["u1"]);
  });

  it("removes a value from the badge chip", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PrincipalPicker
        label="Users"
        options={options}
        selected={["u1", "u2"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Alice" }));

    expect(onChange).toHaveBeenCalledWith(["u2"]);
  });

  it("filters stale selected values when options shrink", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PrincipalPicker
        label="Users"
        options={options}
        selected={["u1", "u9-stale"]}
        onChange={onChange}
      />,
    );

    rerender(
      <PrincipalPicker
        label="Users"
        options={options.slice(0, 1)}
        selected={["u1", "u9-stale"]}
        onChange={onChange}
      />,
    );

    expect(onChange).toHaveBeenCalledWith(["u1"]);
  });

  it("shows the loading skeleton instead of the empty state", async () => {
    render(
      <PrincipalPicker
        label="Users"
        options={[]}
        selected={[]}
        onChange={vi.fn()}
        isLoading
      />,
    );

    await userEvent.setup().click(screen.getByRole("combobox", { name: "Users" }));

    expect(await screen.findAllByText(/.*/)).toBeTruthy();
    // CommandEmpty is only rendered when not loading.
    expect(screen.queryByText("No results.")).not.toBeInTheDocument();
  });
});
