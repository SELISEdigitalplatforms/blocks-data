import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EnumValuesEditor } from "./enum-values-editor";

describe("EnumValuesEditor", () => {
  it("renders existing values and adds a valid value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EnumValuesEditor values={["Draft"]} onChange={onChange} id="enum-test" />);

    expect(screen.getByText("Draft")).toBeInTheDocument();
    const input = screen.getByRole("textbox");
    await user.type(input, "Published");
    await user.click(screen.getByRole("button", { name: /new enum value|add/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as string[];
    expect(next).toEqual(expect.arrayContaining(["Draft", "Published"]));
  });

  it("rejects invalid names", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EnumValuesEditor values={[]} onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "1bad");
    await user.click(screen.getByRole("button", { name: /new enum value|add/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/letters, numbers/i)).toBeInTheDocument();
  });
});
