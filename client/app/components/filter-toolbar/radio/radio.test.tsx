import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Radio } from "./radio";

const options = [
  { label: "Ascending", value: "asc" },
  { label: "Descending", value: "desc" },
];

describe("Radio", () => {
  it("shows the selected option label as a badge on the trigger", () => {
    render(<Radio label="Sort" options={options} value="asc" onChange={vi.fn()} />);
    expect(screen.getByText("Ascending")).toBeInTheDocument();
  });

  it("emits the chosen value when an option is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Radio label="Sort" options={options} value="" onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Descending"));
    expect(onChange).toHaveBeenCalledWith("desc");
  });

  it("filters options by the search input", async () => {
    const user = userEvent.setup();
    render(<Radio label="Sort" options={options} value="" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button"));
    const search = await screen.findByPlaceholderText("Sort");
    await user.type(search, "desc");
    expect(screen.getByText("Descending")).toBeInTheDocument();
    expect(screen.queryByText("Ascending")).toBeNull();
  });

  it("shows a no-results message when the search matches nothing", async () => {
    const user = userEvent.setup();
    render(<Radio label="Sort" options={options} value="" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button"));
    const search = await screen.findByPlaceholderText("Sort");
    await user.type(search, "zzz");
    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  it("clears the selection to null via the Clear control", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Radio label="Sort" options={options} value="asc" onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
