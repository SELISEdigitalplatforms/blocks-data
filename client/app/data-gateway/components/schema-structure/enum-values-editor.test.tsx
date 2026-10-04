import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EnumValuesEditor } from "./enum-values-editor";

function Harness({ initial = [], onChange }: { initial?: string[]; onChange?: (v: string[]) => void }) {
  const [values, setValues] = useState(initial);
  return (
    <EnumValuesEditor
      values={values}
      onChange={(v) => {
        setValues(v);
        onChange?.(v);
      }}
    />
  );
}

const input = () => screen.getByLabelText("New enum value");

describe("EnumValuesEditor", () => {
  it("renders existing values and commits on Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["Draft"]} onChange={onChange} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    await user.type(input(), "Published{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["Draft", "Published"]);
    expect(input()).toHaveValue("");
  });

  it("commits on space and comma", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), "One Two,Three ");
    expect(onChange).toHaveBeenLastCalledWith(["One", "Two", "Three"]);
  });

  it("commits the pending value on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), "Pending");
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(["Pending"]);
  });

  it("splits pasted lists on commas, spaces and newlines", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.paste(input(), { clipboardData: { getData: () => "a, b\nc d" } });
    expect(onChange).toHaveBeenLastCalledWith(["a", "b", "c", "d"]);
  });

  it("shows an inline error for invalid names and does not add them", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), "1bad{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/letters, numbers/i)).toBeInTheDocument();
    expect(input()).toHaveValue("1bad");
  });

  it("rejects duplicates", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["Draft"]} onChange={onChange} />);
    await user.type(input(), "Draft{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Already added.")).toBeInTheDocument();
  });

  it("removes a chip with × and pulls back the last chip on Backspace", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onChange={onChange} />);
    await user.click(screen.getByLabelText("Remove a"));
    expect(onChange).toHaveBeenLastCalledWith(["b", "c"]);
    await user.click(input());
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
    expect(input()).toHaveValue("c");
  });

  it("edits a chip on double-click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["Old"]} onChange={onChange} />);
    await user.dblClick(screen.getByText("Old"));
    const edit = screen.getByLabelText("Edit Old");
    await user.clear(edit);
    await user.type(edit, "New{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["New"]);
  });

  it("is read-only when disabled", () => {
    render(<EnumValuesEditor values={["a"]} onChange={vi.fn()} disabled />);
    expect(screen.queryByLabelText("New enum value")).toBeNull();
    expect(screen.queryByLabelText("Remove a")).toBeNull();
  });
});
