import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const getUsers = vi.fn();

// http-client.ts constructs an HttpClient at import time; provide a stub plus
// the project store the component tree reaches for.
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({
    selectedProject: { itemId: "p1", tenantId: "t1", tenantSlug: "slug1", name: "Proj" },
    setSelectedProject: vi.fn(),
  }),
  HttpClient: class {
    get() {}
    post() {}
    put() {}
    patch() {}
    delete() {}
    stream() {}
  },
}));

vi.mock("@blocks-idp/iam/services/user.service", () => ({
  userService: { getUsers: (...args: unknown[]) => getUsers(...args) },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
  showSuccessToast: vi.fn(),
  showInfoToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

import { SchemaAccessList } from "./schema-access-list";
import type { AccessEntry, PermissionOption } from "../models/schema-access.types";
import type { IRole } from "@blocks-idp/iam/models/role";

const roles: IRole[] = [
  { itemId: "r1", name: "Admin", description: "", slug: "admin" },
  { itemId: "r2", name: "Viewer", description: "", slug: "viewer" },
];

const permissions: PermissionOption[] = [
  { resource: "res-read", name: "Read", resourceGroup: "data" },
  { resource: "res-write", name: "Write", resourceGroup: "data" },
];

function renderList(props: Partial<Parameters<typeof SchemaAccessList>[0]> = {}) {
  const onEntryChange = vi.fn();
  const onRemoveEntry = vi.fn();
  render(
    <SchemaAccessList
      entries={[]}
      roles={roles}
      permissions={permissions}
      onEntryChange={onEntryChange}
      onRemoveEntry={onRemoveEntry}
      {...props}
    />,
    { wrapper: createWrapper() },
  );
  return { onEntryChange, onRemoveEntry };
}

beforeEach(() => {
  getUsers.mockReset();
  // Radix Select / Popover rely on pointer-capture APIs jsdom lacks.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture = vi.fn();
  proto.setPointerCapture = vi.fn();
  proto.releasePointerCapture = vi.fn();
  proto.scrollIntoView = vi.fn();
});

describe("SchemaAccessList", () => {
  it("renders entries read-only with their type, name and department", () => {
    const entries: AccessEntry[] = [
      { type: "Role", name: "Admin", department: "admin" },
      { type: "User", name: "Jane Doe", department: "jane@x.io" },
    ];
    renderList({ entries, isEditing: false });

    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    // No editing affordances in read-only mode.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no entries", () => {
    renderList({ entries: [] });
    expect(screen.getByText("No access entries available.")).toBeInTheDocument();
  });

  it("renders a type select, a name combobox and a remove button when editing", () => {
    const entries: AccessEntry[] = [{ type: "Role", name: "Admin", roleSlug: "admin" }];
    renderList({ entries, isEditing: true });

    // Two comboboxes per row: the type Select and the role Popover trigger.
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Remove role Admin" }),
    ).toBeInTheDocument();
  });

  it("fires onRemoveEntry with the row index", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [
      { type: "Role", name: "Admin", roleSlug: "admin" },
      { type: "User", name: "Jane", userId: "u1" },
    ];
    const { onRemoveEntry } = renderList({ entries, isEditing: true });

    await user.click(screen.getByRole("button", { name: "Remove user Jane" }));
    expect(onRemoveEntry).toHaveBeenCalledWith(1);
  });

  it("selecting a role from the combobox fires onEntryChange", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "Role", name: "" }];
    const { onEntryChange } = renderList({ entries, isEditing: true });

    // The name combobox is the second combobox in the row (after the type select).
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByText("Viewer"));

    expect(onEntryChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ name: "Viewer", roleSlug: "viewer", department: "viewer" }),
    );
  });

  it("filters the role list by the search box", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "Role", name: "" }];
    renderList({ entries, isEditing: true });

    await user.click(screen.getAllByRole("combobox")[1]);
    await user.type(await screen.findByPlaceholderText("Search roles..."), "view");

    await waitFor(() => {
      expect(screen.getByText("Viewer")).toBeInTheDocument();
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    });
  });

  it("selecting a permission from the combobox fires onEntryChange", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "Permission", name: "" }];
    const { onEntryChange } = renderList({ entries, isEditing: true });

    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(await screen.findByText("Write"));

    expect(onEntryChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        name: "Write",
        permissionResource: "res-write",
        department: "data",
      }),
    );
  });

  it("shows a loading message while roles load", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "Role", name: "" }];
    renderList({ entries, isEditing: true, rolesLoading: true, roles: [] });

    await user.click(screen.getAllByRole("combobox")[1]);
    expect(await screen.findByText("Loading roles...")).toBeInTheDocument();
  });

  it("shows a loading message while permissions load", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "Permission", name: "" }];
    renderList({ entries, isEditing: true, permissionsLoading: true, permissions: [] });

    await user.click(screen.getAllByRole("combobox")[1]);
    expect(await screen.findByText("Loading permissions...")).toBeInTheDocument();
  });

  it("loads users on demand and fires onEntryChange when one is selected", async () => {
    const user = userEvent.setup();
    getUsers.mockResolvedValue({
      data: [
        {
          itemId: "u1",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@x.io",
          userName: "jane",
        },
      ],
      totalCount: 1,
      errors: null,
    });
    const entries: AccessEntry[] = [{ type: "User", name: "" }];
    const { onEntryChange } = renderList({ entries, isEditing: true, projectKey: "t1" });

    await user.click(screen.getAllByRole("combobox")[1]);

    const option = await screen.findByText("Jane Doe");
    await waitFor(() => expect(getUsers).toHaveBeenCalled());
    await user.click(option);

    expect(onEntryChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ name: "Jane Doe", userId: "u1", department: "jane@x.io" }),
    );
  });

  it("changing the type via the select fires onEntryChange and clears the name", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "Role", name: "Admin", roleSlug: "admin" }];
    const { onEntryChange } = renderList({ entries, isEditing: true });

    // The type Select is the first combobox in the row.
    const [typeSelect] = screen.getAllByRole("combobox");
    await user.click(typeSelect);
    await user.click(await screen.findByRole("option", { name: "User" }));

    expect(onEntryChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ type: "User", name: "", roleSlug: undefined }),
    );
  });

  it("resets the user search when switching a User row to another type", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "User", name: "Jane", userId: "u1" }];
    const { onEntryChange } = renderList({ entries, isEditing: true });

    const [typeSelect] = screen.getAllByRole("combobox");
    await user.click(typeSelect);
    await user.click(await screen.findByRole("option", { name: "Role" }));

    expect(onEntryChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ type: "Role", name: "" }),
    );
  });

  it("filters the permission list by the search box", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "Permission", name: "" }];
    renderList({ entries, isEditing: true });

    await user.click(screen.getAllByRole("combobox")[1]);
    await user.type(
      await screen.findByPlaceholderText("Search permissions..."),
      "Write",
    );

    await waitFor(() =>
      expect(screen.queryByText("Read")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Write")).toBeInTheDocument();
  });

  it("closes the role popover and clears its search on dismiss", async () => {
    const user = userEvent.setup();
    const entries: AccessEntry[] = [{ type: "Role", name: "" }];
    renderList({ entries, isEditing: true });

    await user.click(screen.getAllByRole("combobox")[1]);
    const search = await screen.findByPlaceholderText("Search roles...");
    await user.type(search, "Adm");
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText("Search roles..."),
      ).not.toBeInTheDocument(),
    );
  });
});
