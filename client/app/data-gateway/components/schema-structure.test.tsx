import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Shared spies referenced inside hoisted vi.mock factories.
 */
const { mutateAsync, showSuccessToast, showErrorToast } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

// ---- Service / store mocks ------------------------------------------------
// http-client.ts constructs `new HttpClient(...)` at import time.
vi.mock("@seliseblocks/genesis-os", () => ({
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

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
  showSuccessToast,
  showInfoToast: vi.fn(),
  showErrorToast,
}));

// useUpdateSchemaStructure is called directly; useSchemaList is pulled in by the
// (real) useDtoPreviewMap hook and must resolve to a child schema for the
// child-expansion path.
vi.mock("../hooks/use-configuration", () => ({
  useUpdateSchemaStructure: () => ({ mutateAsync, isPending: false }),
  useRawIntrospectionQuery: () => ({ data: undefined }),
  useSchemaList: () => ({
    data: {
      data: {
        items: [
          {
            id: "child1",
            schemaName: "Address",
            schemaType: 2,
            fields: [{ name: "street", type: "String", isArray: false }],
          },
        ],
      },
    },
  }),
}));

// ---- Heavy child component stubs (echo the props we assert on) -------------
vi.mock("./schema-structure/schema-structure-header", () => ({
  SchemaStructureHeader: (p: Record<string, unknown>) => (
    <div
      data-testid="schema-header"
      data-edit={String(p.isEditMode)}
      data-dirty={String(p.isDirty)}
      data-fields={String(p.fieldsLength)}
    >
      <span>{p.schemaName}</span>
      <button type="button" onClick={p.onEditToggle}>
        toggle-edit
      </button>
      <button type="submit" onClick={() => p.onSaveClick?.()}>
        header-save
      </button>
      <button type="button" onClick={() => p.onTabChange("data")}>
        go-data
      </button>
      <button type="button" onClick={() => p.onTabChange("attribute")}>
        go-attr
      </button>
      <button type="button" onClick={() => p.onSelectAll(true)}>
        select-all
      </button>
      <button type="button" onClick={p.onBulkDelete}>
        bulk-delete
      </button>
      <button type="button" onClick={p.onBulkDuplicate}>
        bulk-duplicate
      </button>
      <button type="button" onClick={() => p.setIsPreviewDrawerOpen(true)}>
        open-preview
      </button>
    </div>
  ),
}));

vi.mock("./schema-structure/schema-desktop-row", () => ({
  SchemaDesktopRow: (p: Record<string, unknown>) => {
    const name = p.properties?.[p.index]?.name ?? p.field?.name ?? "";
    return (
      <tr>
        <td>
          <div
            data-testid="desktop-row"
            data-index={p.index}
            data-access-validation={String(p.showAccessValidationColumn)}
            data-access-column={String(p.showAccessColumn)}
            data-edit={String(p.isEditMode)}
          >
            <span data-testid={`row-name-${p.index}`}>{name}</span>
            <button type="button" onClick={() => p.onDelete(p.index)}>
              {`del-${p.index}`}
            </button>
            <button type="button" onClick={() => p.onDuplicate(p.index)}>
              {`dup-${p.index}`}
            </button>
            <button type="button" onClick={() => p.onToggleExpand?.(p.index)}>
              {`expand-${p.index}`}
            </button>
            <button type="button" onClick={() => p.onOpenAccessDrawer({ name }, "Manage access")}>
              {`access-${p.index}`}
            </button>
            <button type="button" onClick={() => p.onOpenValidationDrawer(name)}>
              {`validation-${p.index}`}
            </button>
          </div>
        </td>
      </tr>
    );
  },
}));

vi.mock("./schema-structure/schema-mobile-card", () => ({
  SchemaMobileCard: (p: Record<string, unknown>) => (
    <div data-testid="mobile-row" data-index={p.index} />
  ),
}));

vi.mock("./schema-data", () => ({
  SchemaDataTab: (p: Record<string, unknown>) => <div data-testid="data-tab">{p.schemaName}</div>,
}));

vi.mock("./child-schema-expandable-content", () => ({
  ChildSchemaExpandableContent: (p: Record<string, unknown>) => (
    <div data-testid="child-content">
      {p.schemaId}
      <button
        type="button"
        onClick={() =>
          p.onNestedSchemaChange?.({
            schemaDefinitionItemId: p.schemaId,
            projectKey: p.projectKey,
            fields: [
              { name: "Name", type: "String", isArray: false },
              { name: "Id", type: "String", isArray: false },
            ],
          })
        }
      >
        change-child-fields
      </button>
    </div>
  ),
}));

vi.mock("./schema-access-control-drawer", () => ({
  default: (p: Record<string, unknown>) => (
    <div
      data-testid="access-drawer"
      data-open={String(!!p.open)}
      data-fields={(p.fieldNames ?? []).join(",")}
    >
      {p.title}
    </div>
  ),
}));

vi.mock("./schema-preview-drawer", () => ({
  SchemaPreviewDrawer: (p: Record<string, unknown>) => (
    <div data-testid="preview-drawer" data-open={String(!!p.open)}>
      {p.schemaName}
    </div>
  ),
}));

vi.mock("./schema-fields-validation/schema-field-validation-drawer", () => ({
  SchemaFieldValidationDrawer: (p: Record<string, unknown>) => (
    <div data-testid="validation-drawer" data-open={String(!!p.open)}>
      {p.fieldName}
    </div>
  ),
}));

vi.mock("./schema-structure-table-skeleton", () => ({
  SchemaStructureTableSkeleton: () => <div data-testid="skeleton" />,
}));

import SchemaStructureTable from "./schema-structure";

type Props = Parameters<typeof SchemaStructureTable>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    id: "s1",
    schemaName: "User",
    schemaType: 1,
    collectionName: "users",
    fields: [
      { name: "email", type: "String", isArray: false },
      { name: "age", type: "Int", isArray: false },
    ],
    totalPermissions: 0,
    totalRoles: 0,
    totalUsers: 0,
    projectShortKey: "slug1",
    totalSchemaReferences: 0,
    schemaReferences: [],
    deleteAccessLevel: 0,
    editAccessLevel: 0,
    readAccessLevel: 0,
    writeAccessLevel: 0,
    ...overrides,
  } as unknown as Props;
}

function renderTable(overrides: Partial<Props> = {}) {
  return render(<SchemaStructureTable {...baseProps(overrides)} />);
}

const rows = () => screen.queryAllByTestId("desktop-row");

describe("SchemaStructureTable", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    showSuccessToast.mockReset();
    showErrorToast.mockReset();
  });

  it("renders the loading skeleton when isLoading is true", () => {
    renderTable({ isLoading: true });
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-header")).not.toBeInTheDocument();
  });

  it("renders the placeholder InfoCard when no schema id is provided", () => {
    renderTable({ id: "" });
    expect(screen.getByText("Schema Structure")).toBeInTheDocument();
    expect(
      screen.getByText(/Select a schema from the sidebar to view its structure/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("schema-header")).not.toBeInTheDocument();
  });

  it("renders the header and a desktop row per field with names", () => {
    renderTable();
    expect(screen.getByTestId("schema-header")).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(screen.getByTestId("row-name-0")).toHaveTextContent("email");
    expect(screen.getByTestId("row-name-1")).toHaveTextContent("age");
  });

  it("forwards the field count and schema name to the header", () => {
    renderTable();
    const header = screen.getByTestId("schema-header");
    expect(header).toHaveAttribute("data-fields", "2");
    expect(within(header).getByText("User")).toBeInTheDocument();
  });

  it("enters edit mode from the header and shows the bottom add-property button", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(screen.queryByRole("button", { name: "+ Add property" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "toggle-edit" }));

    expect(screen.getByTestId("schema-header")).toHaveAttribute("data-edit", "true");
    expect(screen.getByRole("button", { name: "+ Add property" })).toBeInTheDocument();
  });

  it("appends a new property row when add-property is clicked", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "toggle-edit" }));
    expect(rows()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "+ Add property" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
  });

  it("removes a property row when its delete control is clicked", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "toggle-edit" }));
    expect(rows()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "del-0" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    // The first row (email) was removed, leaving age.
    expect(screen.getByTestId("row-name-0")).toHaveTextContent("age");
  });

  it("bulk-deletes all selected rows", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "toggle-edit" }));
    await user.click(screen.getByRole("button", { name: "select-all" }));
    await user.click(screen.getByRole("button", { name: "bulk-delete" }));
    await waitFor(() => expect(rows()).toHaveLength(0));
  });

  it("bulk-duplicates all selected rows", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "toggle-edit" }));
    await user.click(screen.getByRole("button", { name: "select-all" }));
    await user.click(screen.getByRole("button", { name: "bulk-duplicate" }));
    await waitFor(() => expect(rows()).toHaveLength(4));
  });

  it("switches to the Data tab and renders SchemaDataTab", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(screen.queryByTestId("data-tab")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "go-data" }));
    expect(screen.getByTestId("data-tab")).toHaveTextContent("User");
  });

  it("opens the preview drawer from the header", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(screen.getByTestId("preview-drawer")).toHaveAttribute("data-open", "false");

    await user.click(screen.getByRole("button", { name: "open-preview" }));
    expect(screen.getByTestId("preview-drawer")).toHaveAttribute("data-open", "true");
  });

  it("opens the validation drawer for a field", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(screen.queryByTestId("validation-drawer")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "validation-0" }));
    const drawer = screen.getByTestId("validation-drawer");
    expect(drawer).toHaveTextContent("email");
    expect(drawer).toHaveAttribute("data-open", "true");
  });

  it("opens the access drawer with the selected field name", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "access-1" }));

    const drawers = screen.getAllByTestId("access-drawer");
    expect(
      drawers.some(
        (d) => d.getAttribute("data-open") === "true" && d.getAttribute("data-fields") === "age",
      ),
    ).toBe(true);
  });

  it("saves the schema structure and reports success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    renderTable();

    await user.click(screen.getByRole("button", { name: "header-save" }));
    await user.click(await screen.findByRole("button", { name: "Update" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaDefinitionItemId: "s1",
        projectKey: "t1",
        fields: expect.arrayContaining([
          expect.objectContaining({ name: "email" }),
          expect.objectContaining({ name: "age" }),
        ]),
      }),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("shows an error toast when the save fails", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      isSuccess: false,
      errors: [{ message: "bad" }],
    });
    renderTable();

    await user.click(screen.getByRole("button", { name: "header-save" }));
    await user.click(await screen.findByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: [{ message: "bad" }],
      }),
    );
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("shows the empty state and lets you add a first property (child schema)", async () => {
    const user = userEvent.setup();
    renderTable({ schemaType: 2, schemaName: "Address", fields: [] });

    expect(screen.getAllByText(/Click Add Property to set one up/i).length).toBeGreaterThan(0);

    // EmptySchemaPropertyState is an inline component, so it remounts on every
    // parent render; let mount-time re-renders settle before the first click.
    await new Promise((r) => setTimeout(r, 50));
    await user.click(screen.getAllByRole("button", { name: "Add Property" })[0]);

    expect(screen.getByTestId("schema-header")).toHaveAttribute("data-edit", "true");
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("renders the embedded empty state and opens the standalone editor", async () => {
    const user = userEvent.setup();
    const onOpenStandaloneSchemaEditor = vi.fn();
    renderTable({
      schemaType: 2,
      schemaName: "Address",
      fields: [],
      compactView: true,
      onOpenStandaloneSchemaEditor,
    });

    // Embedded view has no header.
    expect(screen.queryByTestId("schema-header")).not.toBeInTheDocument();
    const openButtons = screen.getAllByRole("button", {
      name: "Open child schema",
    });
    expect(openButtons.length).toBeGreaterThan(0);

    // Inline empty-state component remounts on every render; let it settle.
    await new Promise((r) => setTimeout(r, 50));
    await user.click(screen.getAllByRole("button", { name: "Open child schema" })[0]);
    expect(onOpenStandaloneSchemaEditor).toHaveBeenCalledWith("s1");
  });

  it("hides the Access | Validation column when hideAccessValidation is set", () => {
    const { unmount } = renderTable();
    // Entity schema, top-level: column is shown.
    expect(rows()[0]).toHaveAttribute("data-access-validation", "true");
    unmount();

    renderTable({ hideAccessValidation: true });
    expect(rows()[0]).toHaveAttribute("data-access-validation", "false");
  });

  it("does not render the header or bottom add-property button in compact (embedded) view", () => {
    renderTable({ compactView: true });
    expect(screen.queryByTestId("schema-header")).not.toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "+ Add property" })).not.toBeInTheDocument();
  });

  it("embeds edited child fields under their parent in the save payload", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    renderTable({
      fields: [{ name: "CookieName", type: "Address", isArray: true }],
    });

    await user.click(screen.getByRole("button", { name: "toggle-edit" }));
    await user.click(screen.getByRole("button", { name: "expand-0" }));
    await user.click((await screen.findAllByRole("button", { name: "change-child-fields" }))[0]);
    await user.click(screen.getByRole("button", { name: "header-save" }));
    await user.click(await screen.findByRole("button", { name: "Update" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [
          expect.objectContaining({
            name: "CookieName",
            fields: [
              expect.objectContaining({ name: "Name" }),
              expect.objectContaining({ name: "Id" }),
            ],
          }),
        ],
      }),
    );
  });

  it("automatically enables child fields without rendering a second action header", async () => {
    renderTable({
      schemaType: 2,
      compactView: true,
      showEmbeddedEditor: true,
      allowNestedRequiredness: true,
    });

    expect(screen.queryByTestId("schema-header")).not.toBeInTheDocument();
    await waitFor(() => expect(rows()[0]).toHaveAttribute("data-edit", "true"));
  });

  it("expands a child-schema row to render nested content", async () => {
    const user = userEvent.setup();
    renderTable({
      fields: [{ name: "home", type: "Address", isArray: false }],
    });
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "expand-0" }));

    const nested = await screen.findAllByTestId("child-content");
    expect(nested.length).toBeGreaterThan(0);
    expect(nested[0]).toHaveTextContent("child1");
  });
});
