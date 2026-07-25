import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Shared, mutable mock state. `vi.hoisted` guarantees this object exists before
 * the hoisted `vi.mock` factories run, and the factories read fields lazily so
 * each test can retune roles/permissions/save behaviour in `beforeEach`.
 */
const mocks = vi.hoisted(() => ({
  setDataAccess: vi.fn(),
  isSaving: false,
  rolesResult: { data: { data: [] as any[] }, isLoading: false },
  permsResult: {
    data: { data: [] as any[] },
    isLoading: false,
    isFetching: false,
  },
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
  // Resolver query results (roles-by-slug / permissions-by-resource / per-user).
  rolesBySlug: undefined as any,
  permsByResource: undefined as any,
  userQueries: [] as any[],
}));

// `@/lib/http-client` builds `new HttpClient(...)` at import time and the iam
// services pulled in by the drawer import it — stub the class + the store.
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({
    selectedProject: {
      itemId: "p1",
      tenantId: "t1",
      tenantSlug: "slug1",
      name: "Proj",
    },
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

// The drawer's own resolver queries (roles-by-slug, permissions-by-resource,
// per-user) go through react-query directly — return controlled empties.
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => {
    const kind = opts?.queryKey?.[1];
    if (kind === "by-slug") {
      return { data: mocks.rolesBySlug, isLoading: false, isFetching: false };
    }
    if (kind === "by-resource") {
      return { data: mocks.permsByResource, isLoading: false, isFetching: false };
    }
    return { data: undefined, isLoading: false, isFetching: false };
  },
  useQueries: () => mocks.userQueries,
}));

vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useGetRoles: () => mocks.rolesResult,
}));

vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissions: () => mocks.permsResult,
}));

vi.mock("../hooks/use-configuration", () => ({
  useSetDataAccess: () => ({
    mutateAsync: mocks.setDataAccess,
    isPending: mocks.isSaving,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
  showSuccessToast: vi.fn(),
  showInfoToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

// Heavy per-row editor — echo the props the parent drives it with and expose
// buttons that fire the callbacks so we can edit/remove entries from a test.
vi.mock("./schema-access-list", () => ({
  SchemaAccessList: ({
    entries,
    isEditing,
    onEntryChange,
    onRemoveEntry,
    roles,
    rolesLoading,
    permissions,
    permissionsLoading,
    projectKey,
  }: any) => (
    <div
      data-testid="access-list"
      data-editing={String(!!isEditing)}
      data-count={entries.length}
      data-roles={roles?.length ?? 0}
      data-roles-loading={String(!!rolesLoading)}
      data-perms={permissions?.length ?? 0}
      data-perms-loading={String(!!permissionsLoading)}
      data-project={projectKey}
    >
      {entries.map((entry: any, index: number) => (
        <div key={index} data-testid="access-entry">
          {entry.type}:{entry.name || "(empty)"}
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onEntryChange?.(0, {
            type: "Role",
            name: "Admin",
            roleSlug: "admin",
          })
        }
      >
        set-entry-0
      </button>
      <button type="button" onClick={() => onRemoveEntry?.(0)}>
        remove-entry-0
      </button>
    </div>
  ),
}));

// Toolbar — echo edit/save state and surface the four action callbacks.
vi.mock("./schema-access-toolbar", () => ({
  SchemaAccessToolbar: ({
    isEditing,
    isSaving,
    hasUnsavedChanges,
    onAdd,
    onEdit,
    onCancel,
    onSave,
  }: any) => (
    <div
      data-testid="access-toolbar"
      data-editing={String(!!isEditing)}
      data-saving={String(!!isSaving)}
      data-dirty={String(!!hasUnsavedChanges)}
    >
      <button type="button" onClick={onAdd}>
        toolbar-add
      </button>
      <button type="button" onClick={onEdit}>
        toolbar-edit
      </button>
      <button type="button" onClick={onCancel}>
        toolbar-cancel
      </button>
      <button type="button" onClick={onSave}>
        toolbar-save
      </button>
    </div>
  ),
}));

// Keep the confirmation modal gated by its parent <Dialog open> by rendering
// through the real (lightweight) DialogContent, while echoing the copy/buttons.
vi.mock("@/components/confirmation-modal/confirmation-modal", async () => {
  const { DialogContent, DialogTitle } = await import(
    "@/components/ui-kits/dialog/dialog"
  );
  return {
    default: ({ data, onConfirm, onCancel }: any) => (
      <DialogContent hideCloseButton>
        <DialogTitle>{data.dialogTitle}</DialogTitle>
        <div data-testid="confirmation-modal">
          <p>{data.dialogSubtitle}</p>
          <button type="button" onClick={onConfirm}>
            {data.confirmButton}
          </button>
          <button type="button" onClick={onCancel}>
            {data.cancelButton}
          </button>
        </div>
      </DialogContent>
    ),
  };
});

import { SchemaAccessDrawer } from "./schema-access-drawer";

type DrawerProps = Parameters<typeof SchemaAccessDrawer>[0];

function baseProps(overrides: Partial<DrawerProps> = {}): DrawerProps {
  return {
    trigger: <button>Open Drawer</button>,
    schemaId: "schema-1",
    title: "Schema Access",
    open: true,
    onOpenChange: mocks.onOpenChange,
    onSuccess: mocks.onSuccess,
    ...overrides,
  } as DrawerProps;
}

function renderDrawer(overrides: Partial<DrawerProps> = {}) {
  return render(<SchemaAccessDrawer {...baseProps(overrides)} />);
}

/** Empty state -> "Add Configuration" enters edit mode with one draft entry. */
async function addFirstEntry(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Add Configuration/i }),
  );
}

beforeEach(() => {
  mocks.setDataAccess = vi.fn().mockResolvedValue({ isSuccess: true });
  mocks.isSaving = false;
  mocks.rolesResult = { data: { data: [] }, isLoading: false };
  mocks.permsResult = { data: { data: [] }, isLoading: false, isFetching: false };
  mocks.onOpenChange = vi.fn();
  mocks.onSuccess = vi.fn();
  mocks.rolesBySlug = undefined;
  mocks.permsByResource = undefined;
  mocks.userQueries = [];
});

describe("SchemaAccessDrawer", () => {
  it("renders the title and the three access tabs when open", async () => {
    renderDrawer();
    expect(await screen.findByText("Schema Access")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Write/Edit" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Delete" })).toBeInTheDocument();
  });

  it("defaults to the View tab being active", async () => {
    renderDrawer();
    expect(await screen.findByRole("tab", { name: "View" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("shows the empty state with an Add Configuration button when no access exists", async () => {
    renderDrawer();
    expect(
      await screen.findByText(/have any access configuration/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Configuration/i }),
    ).toBeInTheDocument();
    // No toolbar/list until an entry exists.
    expect(screen.queryByTestId("access-toolbar")).not.toBeInTheDocument();
  });

  it("enters edit mode and renders the toolbar + list with one draft entry after Add Configuration", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);

    const list = await screen.findByTestId("access-list");
    expect(screen.getByTestId("access-toolbar")).toBeInTheDocument();
    expect(list).toHaveAttribute("data-count", "1");
    expect(list).toHaveAttribute("data-editing", "true");
    expect(list).toHaveAttribute("data-project", "t1");
    // The single seeded draft entry is a blank Role.
    expect(screen.getByTestId("access-entry")).toHaveTextContent("Role:(empty)");
  });

  it("switches tabs directly when there are no unsaved changes", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await screen.findByRole("tab", { name: "Write/Edit" });
    await user.click(screen.getByRole("tab", { name: "Write/Edit" }));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Write/Edit" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    // No confirmation dialog for a clean switch.
    expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument();
  });

  it("renders server-provided entries once access props resolve", async () => {
    const { rerender } = render(<SchemaAccessDrawer {...baseProps()} />);
    // Access data arrives after mount (mirrors queries resolving in prod).
    rerender(
      <SchemaAccessDrawer
        {...baseProps({
          readAccess: { roles: ["admin"], permissions: ["OWNER"], users: [] },
        })}
      />,
    );

    const list = await screen.findByTestId("access-list");
    await waitFor(() => expect(list).toHaveAttribute("data-count", "2"));
    const entries = screen.getAllByTestId("access-entry").map((n) => n.textContent);
    expect(entries).toContain("Role:admin");
    expect(entries).toContain("Permission:OWNER");
  });

  it("passes available roles and permissions (incl. built-in OWNER) to the list", async () => {
    mocks.rolesResult = {
      data: { data: [{ itemId: "r1", name: "Admin", slug: "admin" }] },
      isLoading: false,
    };
    mocks.permsResult = {
      data: {
        data: [
          {
            itemId: "perm1",
            resource: "read:user",
            name: "Read User",
            resourceGroup: "user",
          },
        ],
      },
      isLoading: false,
      isFetching: false,
    };
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);

    const list = await screen.findByTestId("access-list");
    expect(list).toHaveAttribute("data-roles", "1");
    // OWNER (built-in for schema-level) + read:user = 2.
    expect(list).toHaveAttribute("data-perms", "2");
  });

  it("passes roles/permissions loading flags through to the list", async () => {
    mocks.rolesResult = { data: { data: [] }, isLoading: true };
    mocks.permsResult = { data: { data: [] }, isLoading: true, isFetching: false };
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);

    const list = await screen.findByTestId("access-list");
    expect(list).toHaveAttribute("data-roles-loading", "true");
    expect(list).toHaveAttribute("data-perms-loading", "true");
  });

  it("saves edits and calls the mutation with the expected payload", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);
    // Fill the blank entry with a concrete role.
    await user.click(screen.getByRole("button", { name: "set-entry-0" }));
    await user.click(screen.getByRole("button", { name: "toolbar-save" }));

    await waitFor(() => expect(mocks.setDataAccess).toHaveBeenCalledTimes(1));
    expect(mocks.setDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "t1",
        schemaId: "schema-1",
        readAccess: { roles: ["admin"], permissions: [], users: [] },
        writeAccess: { roles: [], permissions: [], users: [] },
        deleteAccess: { roles: [], permissions: [], users: [] },
        fields: [],
      }),
    );
    await waitFor(() => expect(mocks.onSuccess).toHaveBeenCalled());
  });

  it("does not report success when the save mutation rejects", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.setDataAccess = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);
    await user.click(screen.getByRole("button", { name: "set-entry-0" }));
    await user.click(screen.getByRole("button", { name: "toolbar-save" }));

    await waitFor(() => expect(mocks.setDataAccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("removes a draft entry from the list", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);
    expect(await screen.findByTestId("access-list")).toHaveAttribute(
      "data-count",
      "1",
    );

    await user.click(screen.getByRole("button", { name: "remove-entry-0" }));
    await waitFor(() =>
      expect(screen.getByTestId("access-list")).toHaveAttribute(
        "data-count",
        "0",
      ),
    );
  });

  it("prompts to save when switching tabs with unsaved changes and can be cancelled", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user); // seeds an unsaved change on the View tab
    await user.click(screen.getByRole("tab", { name: "Write/Edit" }));

    const modal = await screen.findByTestId("confirmation-modal");
    expect(
      within(modal).getByRole("button", { name: "Save & Switch" }),
    ).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument(),
    );
    // Stayed on the View tab; nothing saved.
    expect(screen.getByRole("tab", { name: "View" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(mocks.setDataAccess).not.toHaveBeenCalled();
  });

  it("saves and switches tabs when confirming the tab-switch prompt", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);
    await user.click(screen.getByRole("tab", { name: "Write/Edit" }));

    const modal = await screen.findByTestId("confirmation-modal");
    await user.click(within(modal).getByRole("button", { name: "Save & Switch" }));

    await waitFor(() => expect(mocks.setDataAccess).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Write/Edit" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
  });

  it("prompts before closing with unsaved changes and closes on confirm", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);

    await user.click(
      screen.getByRole("button", { name: "Close schema access drawer" }),
    );

    const modal = await screen.findByTestId("confirmation-modal");
    expect(
      within(modal).getByRole("button", { name: "Close Without Saving" }),
    ).toBeInTheDocument();
    // Not closed yet.
    expect(mocks.onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(
      within(modal).getByRole("button", { name: "Close Without Saving" }),
    );
    await waitFor(() =>
      expect(mocks.onOpenChange).toHaveBeenCalledWith(false),
    );
  });

  it("keeps the drawer open when the close prompt is cancelled", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await addFirstEntry(user);

    await user.click(
      screen.getByRole("button", { name: "Close schema access drawer" }),
    );
    const modal = await screen.findByTestId("confirmation-modal");
    await user.click(within(modal).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument(),
    );
    expect(mocks.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("closes immediately (no prompt) when there are no unsaved changes", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await screen.findByText("Schema Access");

    await user.click(
      screen.getByRole("button", { name: "Close schema access drawer" }),
    );

    await waitFor(() => expect(mocks.onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument();
  });

  it("opens the drawer from its trigger when uncontrolled", async () => {
    const user = userEvent.setup();
    render(
      <SchemaAccessDrawer
        trigger={<button>Open Drawer</button>}
        schemaId="schema-1"
        title="Schema Access"
        onOpenChange={mocks.onOpenChange}
      />,
    );
    // Closed initially -> title not rendered.
    expect(screen.queryByText("Schema Access")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Drawer" }));
    expect(await screen.findByText("Schema Access")).toBeInTheDocument();
  });

  it("resolves role, user and permission display names from resolver queries", async () => {
    mocks.rolesBySlug = {
      data: [{ slug: "admin", name: "Administrator", itemId: "r1" }],
    };
    mocks.permsByResource = {
      data: [
        { resource: "read:x", name: "Read X", resourceGroup: "grp", itemId: "p1" },
      ],
    };
    mocks.userQueries = [
      { data: { data: { firstName: "Jane", lastName: "Doe", email: "j@x.com" } } },
    ];

    const { rerender } = render(<SchemaAccessDrawer {...baseProps()} />);
    rerender(
      <SchemaAccessDrawer
        {...baseProps({
          readAccess: { roles: ["admin"], users: ["u1"], permissions: ["read:x"] },
        })}
      />,
    );

    const list = await screen.findByTestId("access-list");
    await waitFor(() => expect(list).toHaveAttribute("data-count", "3"));
    const entries = screen.getAllByTestId("access-entry").map((n) => n.textContent);
    expect(entries).toContain("Role:Administrator");
    expect(entries).toContain("User:Jane Doe");
    expect(entries).toContain("Permission:Read X");
  });

  it("saves role, user and permission rule sets built from resolved entries", async () => {
    mocks.rolesBySlug = {
      data: [{ slug: "admin", name: "Administrator", itemId: "r1" }],
    };
    mocks.permsByResource = {
      data: [{ resource: "read:x", name: "Read X", resourceGroup: "grp", itemId: "p1" }],
    };
    mocks.userQueries = [{ data: { data: { firstName: "Jane", email: "j@x.com" } } }];

    const user = userEvent.setup();
    const { rerender } = render(<SchemaAccessDrawer {...baseProps()} />);
    rerender(
      <SchemaAccessDrawer
        {...baseProps({
          readAccess: { roles: ["admin"], users: ["u1"], permissions: ["read:x"] },
        })}
      />,
    );
    await screen.findByTestId("access-list");

    await user.click(screen.getByRole("button", { name: "toolbar-edit" }));
    await user.click(screen.getByRole("button", { name: "toolbar-save" }));

    await waitFor(() => expect(mocks.setDataAccess).toHaveBeenCalledTimes(1));
    expect(mocks.setDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        readAccess: {
          roles: ["admin"],
          users: ["u1"],
          permissions: ["read:x"],
        },
      }),
    );
  });

  it("aggregates and saves field-level access when fieldTargets are provided", async () => {
    const user = userEvent.setup();
    const emptyRuleSet = { roles: [], permissions: [], users: [] };
    const fieldTargets = [
      {
        name: "field-a",
        readAccess: { roles: ["admin"], permissions: [], users: [] },
        writeAccess: emptyRuleSet,
        deleteAccess: emptyRuleSet,
      },
    ] as any;
    const { rerender } = render(<SchemaAccessDrawer {...baseProps()} />);
    rerender(<SchemaAccessDrawer {...baseProps({ fieldTargets })} />);

    // Aggregated field read access seeds the View entries.
    const list = await screen.findByTestId("access-list");
    await waitFor(() => expect(list).toHaveAttribute("data-count", "1"));

    await user.click(screen.getByRole("button", { name: "toolbar-edit" }));
    await user.click(screen.getByRole("button", { name: "toolbar-save" }));

    await waitFor(() => expect(mocks.setDataAccess).toHaveBeenCalledTimes(1));
    const payload = mocks.setDataAccess.mock.calls[0][0];
    expect(payload.fields).toHaveLength(1);
    expect(payload.fields[0].name).toBe("field-a");
  });
});
