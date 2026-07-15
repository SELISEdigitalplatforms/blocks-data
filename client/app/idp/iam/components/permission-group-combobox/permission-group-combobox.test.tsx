import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useGetResourceGroupMock = vi.fn();

vi.mock("@/store/useProjectStore", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetResourceGroup: (opts: unknown) => useGetResourceGroupMock(opts),
}));

import { PermissionGroupCombobox } from "./permission-group-combobox";

describe("PermissionGroupCombobox", () => {
  beforeEach(() => {
    useGetResourceGroupMock.mockReset();
    useGetResourceGroupMock.mockReturnValue({
      data: [
        { resourceGroup: "iam" },
        { resourceGroup: "billing" },
        { resourceGroup: "storage" },
      ],
    });
  });

  it("shows the placeholder when no value is selected", () => {
    render(<PermissionGroupCombobox value="" onChange={vi.fn()} />);
    expect(screen.getByText("Select or type...")).toBeInTheDocument();
  });

  it("shows the current value on the trigger", () => {
    render(<PermissionGroupCombobox value="iam" onChange={vi.fn()} />);
    expect(screen.getByText("iam")).toBeInTheDocument();
  });

  it("passes the tenant id from the project store to the hook", () => {
    render(<PermissionGroupCombobox value="" onChange={vi.fn()} />);
    expect(useGetResourceGroupMock).toHaveBeenCalledWith({
      projectKey: "tenant-1",
    });
  });

  it("lists resource groups and selects one on click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionGroupCombobox value="" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Select or type..." }));

    const billing = await screen.findByText("billing");
    await user.click(billing);

    expect(onChange).toHaveBeenCalledWith("billing");
  });

  it("filters the options by the typed text", async () => {
    const user = userEvent.setup();
    render(<PermissionGroupCombobox value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Select or type..." }));

    const input = await screen.findByPlaceholderText("Search or type...");
    await user.type(input, "bill");

    await waitFor(() => {
      expect(screen.getByText("billing")).toBeInTheDocument();
      expect(screen.queryByText("iam")).not.toBeInTheDocument();
      expect(screen.queryByText("storage")).not.toBeInTheDocument();
    });
  });

  it("emits the typed value when the add button is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionGroupCombobox value="" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Select or type..." }));

    const input = await screen.findByPlaceholderText("Search or type...");
    await user.type(input, "new-group");

    // The Plus button is the icon button next to the search input.
    const buttons = screen.getAllByRole("button");
    const addButton = buttons[buttons.length - 1];
    await user.click(addButton);

    expect(onChange).toHaveBeenCalledWith("new-group");
  });
});
