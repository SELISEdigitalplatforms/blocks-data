import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const useGetPermissions = vi.fn();
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissions: (...a: unknown[]) => useGetPermissions(...a),
}));

vi.mock("@/components/filter-toolbar", () => ({
  FilterControls: {
    SearchInput: ({
      onChange,
      value,
    }: {
      onChange: (v: string) => void;
      value: string;
    }) => (
      <input
        data-testid="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
  },
}));
vi.mock("@/components/ui-kits/pagination/pagination", () => ({
  Pagination: () => <div data-testid="pagination" />,
}));

import { AddDependentPermission } from "./add-dependent-permission";

const permissions = [
  { itemId: "p1", resource: "r1", name: "Read", type: 1 },
  { itemId: "p2", resource: "r2", name: "Write", type: 2 },
];

afterEach(() => vi.clearAllMocks());

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: "Add" })[0]);
}

describe("AddDependentPermission", () => {
  it("opens the assign-permissions dialog listing permissions", async () => {
    const user = userEvent.setup();
    useGetPermissions.mockReturnValue({ data: { data: permissions, totalCount: 2 }, isLoading: false });
    render(<AddDependentPermission onAdd={vi.fn()} permissionsResource={[]} />);
    await openDialog(user);
    expect(await screen.findByText("Assign Permissions")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Write")).toBeInTheDocument();
    expect(screen.getByText("Endpoint")).toBeInTheDocument();
  });

  it("adds the selected permissions through the onAdd callback", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    useGetPermissions.mockReturnValue({ data: { data: permissions, totalCount: 2 }, isLoading: false });
    render(<AddDependentPermission onAdd={onAdd} permissionsResource={[]} />);
    await openDialog(user);

    const checkboxes = await screen.findAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith([permissions[0]]);
  });

  it("disables already-assigned permissions", async () => {
    const user = userEvent.setup();
    useGetPermissions.mockReturnValue({ data: { data: permissions, totalCount: 2 }, isLoading: false });
    render(<AddDependentPermission onAdd={vi.fn()} permissionsResource={["r1"]} />);
    await openDialog(user);
    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[0]).toBeChecked();
  });

  it("shows pagination when the total exceeds the page size", async () => {
    const user = userEvent.setup();
    useGetPermissions.mockReturnValue({ data: { data: permissions, totalCount: 20 }, isLoading: false });
    render(<AddDependentPermission onAdd={vi.fn()} permissionsResource={[]} />);
    await openDialog(user);
    expect(await screen.findByTestId("pagination")).toBeInTheDocument();
  });

  it("filters the list via the search input", async () => {
    const user = userEvent.setup();
    useGetPermissions.mockReturnValue({ data: { data: permissions, totalCount: 2 }, isLoading: false });
    render(<AddDependentPermission onAdd={vi.fn()} permissionsResource={[]} />);
    await openDialog(user);
    await user.type(await screen.findByTestId("search"), "Re");
    await waitFor(() =>
      expect(useGetPermissions).toHaveBeenCalledWith(expect.objectContaining({ search: "Re" })),
    );
  });
});
