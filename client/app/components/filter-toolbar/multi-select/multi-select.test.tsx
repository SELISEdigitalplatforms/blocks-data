import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiSelect } from "./multi-select";

const options = [
  { label: "AWS", value: "Amazon" },
  { label: "Azure", value: "Azure" },
  { label: "SFTP", value: "SftpStorage" },
];

describe("MultiSelect", () => {
  it("renders the label on the trigger", () => {
    render(<MultiSelect label="Provider" options={options} value={[]} onChange={vi.fn()} />);
    expect(screen.getAllByText("Provider").length).toBeGreaterThan(0);
  });

  it("shows badges for the currently selected options", () => {
    render(
      <MultiSelect label="Provider" options={options} value={["Amazon"]} onChange={vi.fn()} />,
    );
    expect(screen.getByText("AWS")).toBeInTheDocument();
  });

  it("collapses to a count badge when more than two are selected", () => {
    render(
      <MultiSelect
        label="Provider"
        options={options}
        value={["Amazon", "Azure", "SftpStorage"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("adds a value when an unselected option is chosen", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiSelect label="Provider" options={options} value={[]} onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Azure"));
    expect(onChange).toHaveBeenCalledWith(["Azure"]);
  });

  it("removes a value when an already-selected option is chosen", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelect
        label="Provider"
        options={options}
        value={["Amazon"]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button"));
    // "AWS" appears both as a selected badge and as an option in the list.
    const optionInList = (await screen.findAllByText("AWS")).at(-1)!;
    await user.click(optionInList);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("clears all selections via the Clear item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelect
        label="Provider"
        options={options}
        value={["Amazon", "Azure"]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Clear"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
