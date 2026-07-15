import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageFiltersToolbar } from "./storage-filters-toolbar";

function renderToolbar(overrides = {}) {
  const props = {
    filters: { search: "", providers: [], types: [] },
    onChange: vi.fn(),
    onReset: vi.fn(),
    onAddConfiguration: vi.fn(),
    onConnectStorage: vi.fn(),
    ...overrides,
  };
  render(<StorageFiltersToolbar {...props} />);
  return props;
}

describe("StorageFiltersToolbar", () => {
  it("renders the search filter control", () => {
    renderToolbar();
    expect(screen.getAllByPlaceholderText("Search...").length).toBeGreaterThan(0);
  });

  it("renders the provider multi-select label", () => {
    renderToolbar();
    expect(screen.getAllByText("Provider").length).toBeGreaterThan(0);
  });

  it("invokes onAddConfiguration from the Add menu", async () => {
    const user = userEvent.setup();
    const props = renderToolbar();
    await user.click(screen.getByRole("button", { name: /^Add$/ }));
    await user.click(await screen.findByText("Add Configuration"));
    expect(props.onAddConfiguration).toHaveBeenCalledTimes(1);
  });
});
