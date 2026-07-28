import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortHeader } from "./sort-header";

describe("SortHeader", () => {
  it("renders its label", () => {
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "", isDescending: false }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("activates ascending sort on first click of an inactive header", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "", isDescending: false }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByText("Name"));
    expect(onChange).toHaveBeenCalledWith({ property: "name", isDescending: false });
  });

  it("toggles to descending when clicking the already-active ascending header", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "name", isDescending: false }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByText("Name"));
    expect(onChange).toHaveBeenCalledWith({ property: "name", isDescending: true });
  });

  it("resets to ascending when clicking a different, currently-active header", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SortHeader
        id="name"
        label="Name"
        value={{ property: "date", isDescending: true }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByText("Name"));
    expect(onChange).toHaveBeenCalledWith({ property: "name", isDescending: false });
  });
});
