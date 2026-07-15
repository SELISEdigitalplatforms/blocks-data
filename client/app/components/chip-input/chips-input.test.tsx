import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ChipsInput,
  ChipsInputField,
  ChipsInputList,
  useChipsContext,
} from "./chips-input";

function renderChips(
  props: Partial<React.ComponentProps<typeof ChipsInput>> = {},
) {
  const onChange = vi.fn();
  render(
    <ChipsInput value={props.value ?? []} onChange={onChange} {...props}>
      <ChipsInputList />
      <ChipsInputField />
    </ChipsInput>,
  );
  return { onChange };
}

describe("ChipsInput", () => {
  it("renders existing chips", () => {
    renderChips({ value: ["alpha", "beta"] });
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("adds a trimmed chip on Enter", async () => {
    const user = userEvent.setup();
    const { onChange } = renderChips({ value: ["alpha"] });
    const input = screen.getByPlaceholderText("Type and press enter");
    await user.type(input, "  beta  ");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["alpha", "beta"]);
  });

  it("does not add an empty chip on Enter", async () => {
    const user = userEvent.setup();
    const { onChange } = renderChips({ value: [] });
    const input = screen.getByPlaceholderText("Type and press enter");
    await user.type(input, "   ");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a chip when its remove control is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderChips({ value: ["alpha", "beta"] });
    await user.click(screen.getByLabelText("Remove alpha"));
    expect(onChange).toHaveBeenCalledWith(["beta"]);
  });

  it("shows an error and blocks adding when a customValidator fails", async () => {
    const user = userEvent.setup();
    const { onChange } = renderChips({
      value: ["dup"],
      customValidator: (val: string) => val !== "dup",
      validatorRegexErrorMessage: "Duplicate tags are not allowed",
    });
    const input = screen.getByPlaceholderText("Type and press enter");
    await user.type(input, "dup");
    expect(screen.getByText("Duplicate tags are not allowed")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows an error when a validatorRegex fails", async () => {
    const user = userEvent.setup();
    const { onChange } = renderChips({
      value: [],
      validatorRegex: /^[a-z]+$/,
      validatorRegexErrorMessage: "Only lowercase letters",
    });
    const input = screen.getByPlaceholderText("Type and press enter");
    await user.type(input, "ABC");
    expect(screen.getByText("Only lowercase letters")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("throws when the field is used outside of the provider", () => {
    function Orphan() {
      useChipsContext();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/ChipsInput components must be used within/);
    spy.mockRestore();
  });
});
