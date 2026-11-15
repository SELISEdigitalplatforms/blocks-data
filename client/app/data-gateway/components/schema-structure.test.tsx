import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// The real Node process: genesis-os replaces the global `process` in the browser bundle.
import nodeProcess from "node:process";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Shared spies referenced inside hoisted vi.mock factories.
 */
const { mutateAsync, saveState, showSuccessToast, showErrorToast } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  /** What useUpdateSchemaStructure reports as `isPending`: true while a confirmed save is in flight. */
  saveState: { isPending: false },
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

// ---- Service / store mocks ------------------------------------------------
// http-client.ts constructs `new HttpClient(...)` at import time and re-exports HttpError.
vi.mock("@seliseblocks/genesis-os", async () => ({
  HttpError: (await import("@/test-utils/__mocks__/mock-http-client")).mockHttpClientFactory().HttpError,
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
// The not-found helpers are the real ones, so a save that finds the schema gone acts on a real cache.
vi.mock("../hooks/use-configuration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-configuration")>();
  return {
  isSchemaNotFound: actual.isSchemaNotFound,
  removeSchemaDetails: actual.removeSchemaDetails,
  refreshSchemaLists: actual.refreshSchemaLists,
  useUpdateSchemaStructure: () => ({ mutateAsync, isPending: saveState.isPending }),
  useRawIntrospectionQuery: () => ({ data: undefined }),
  usePendingSchemaIds: () => new Set<string>(),
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
  };
});

// The tree's data hook reads the query cache; here it lists each open root's child fields directly.
const useNestedTree = vi.hoisted(() =>
  vi.fn(({ roots }: { roots: Array<{ path: string; childSchema: { fields?: Array<{ name: string }> } }> }) =>
    new Map(
      roots.map((root) => [
        root.path,
        (root.childSchema.fields ?? []).map((field) => ({ kind: "field", path: `${root.path}.${field.name}`, field })),
      ]),
    ),
  ),
);
vi.mock("../hooks/use-nested-tree", () => ({ useNestedTree }));

vi.mock("./schema-structure/property-tree", () => ({
  NestedTreeRowView: (p: { row: { path: string } }) => (
    <tr>
      <td data-testid="tree-row">{p.row.path}</td>
    </tr>
  ),
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
          >
            <span data-testid={`row-name-${p.index}`}>{name}</span>
            <button type="button" onClick={() => p.onDelete(p.index)}>
              {`del-${p.index}`}
            </button>
            <button
              type="button"
              onClick={() =>
                p.setValue(`properties.${p.index}.name`, `renamed-${p.index}`, {
                  shouldDirty: true,
                })
              }
            >
              {`rename-${p.index}`}
            </button>
            <button type="button" onClick={() => p.onDuplicate(p.index)}>
              {`dup-${p.index}`}
            </button>
            <button type="button" onClick={() => p.onToggleExpand?.(p.index)}>
              {`expand-${p.index}`}
            </button>
            <button
              type="button"
              onClick={() =>
                p.onOpenAccessDrawer({ name }, "Manage access")
              }
            >
              {`access-${p.index}`}
            </button>
            <button
              type="button"
              onClick={() => p.onOpenValidationDrawer(name)}
            >
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
    <div data-testid="child-content">{p.schemaId}</div>
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
    <div
      data-testid="preview-drawer"
      data-open={String(!!p.open)}
      data-details={(p.schemaDetails as { schemaName?: string } | undefined)?.schemaName}
      data-all-schemas={(p.allSchemas as unknown[] | undefined)?.length}
      data-live-state={String(p.liveState)}
    >
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

import { HttpError } from "@/lib/http-client";
import SchemaStructureTable from "./schema-structure";

let queryClient = new QueryClient();

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
  return render(
    <QueryClientProvider client={queryClient}>
      <SchemaStructureTable {...baseProps(overrides)} />
    </QueryClientProvider>,
  );
}

const SCHEMA_NOT_FOUND_BODY = { isSuccess: false, message: "Schema not found", httpStatusCode: 404, data: null, errors: null };

/** Enters edit mode, deletes the first row (an unsaved change), then saves and confirms. */
async function editAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "toggle-edit" }));
  await user.click(screen.getByRole("button", { name: "del-0" }));
  await waitFor(() => expect(rows()).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "header-save" }));
  await user.click(await screen.findByRole("button", { name: "Update" }));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
}

const editMode = () => screen.getByTestId("schema-header").getAttribute("data-edit");

const rows = () => screen.queryAllByTestId("desktop-row");

describe("SchemaStructureTable", () => {
  beforeEach(() => {
    queryClient = new QueryClient();
    mutateAsync.mockReset();
    saveState.isPending = false;
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

  it("forwards the field count to the header", () => {
    renderTable();
    const header = screen.getByTestId("schema-header");
    expect(header).toHaveAttribute("data-fields", "2");
  });

  it("enters edit mode from the header and shows the bottom add-property button", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(
      screen.queryByRole("button", { name: "+ Add property" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "toggle-edit" }));

    expect(screen.getByTestId("schema-header")).toHaveAttribute(
      "data-edit",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "+ Add property" }),
    ).toBeInTheDocument();
  });

  it("calls onEnterEditMode when Edit is clicked, but not when Cancel later leaves edit mode", async () => {
    const user = userEvent.setup();
    const onEnterEditMode = vi.fn();
    renderTable({ onEnterEditMode });

    await user.click(screen.getByRole("button", { name: "toggle-edit" }));
    expect(screen.getByTestId("schema-header")).toHaveAttribute("data-edit", "true");
    expect(onEnterEditMode).toHaveBeenCalledTimes(1);

    // Same button doubles as Cancel once in edit mode — leaving must not
    // re-fire the callback a docked inspector's close is wired to.
    await user.click(screen.getByRole("button", { name: "toggle-edit" }));
    expect(screen.getByTestId("schema-header")).toHaveAttribute("data-edit", "false");
    expect(onEnterEditMode).toHaveBeenCalledTimes(1);
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
    expect(screen.getByTestId("preview-drawer")).toHaveAttribute(
      "data-open",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "open-preview" }));
    expect(screen.getByTestId("preview-drawer")).toHaveAttribute(
      "data-open",
      "true",
    );
  });

  it("hands the preview drawer the schema, the project's schemas and its live state", () => {
    renderTable({ isLive: false });
    const drawer = screen.getByTestId("preview-drawer");
    expect(drawer).toHaveAttribute("data-details", "User");
    // The mocked list answers both the entity and the DTO query with one schema.
    expect(drawer).toHaveAttribute("data-all-schemas", "2");
    expect(drawer).toHaveAttribute("data-live-state", "not-live");
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

  // Same split as onOpenFieldAccess: a host that can dock a panel gets a
  // callback instead of the drawer being opened locally.
  it("hands validation to a docked inspector instead of the drawer when the host provides one", async () => {
    const user = userEvent.setup();
    const onOpenFieldValidation = vi.fn();
    renderTable({ onOpenFieldValidation });

    await user.click(screen.getByRole("button", { name: "validation-0" }));

    expect(onOpenFieldValidation).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: "email", subject: "email" }),
    );
    expect(screen.queryByTestId("validation-drawer")).not.toBeInTheDocument();
  });

  it("opens the access drawer with the selected field name", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "access-1" }));

    const drawers = screen.getAllByTestId("access-drawer");
    expect(
      drawers.some(
        (d) =>
          d.getAttribute("data-open") === "true" &&
          d.getAttribute("data-fields") === "age",
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

  it("keeps today's success path: toast, leaves edit mode, keeps the selection (H13)", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const onSchemaGone = vi.fn();
    renderTable({ onSchemaGone });

    await editAndSave(user);

    await waitFor(() => expect(showSuccessToast).toHaveBeenCalledWith({ description: "Schema updated successfully" }));
    expect(editMode()).toBe("false");
    expect(onSchemaGone).not.toHaveBeenCalled();
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it("says the schema no longer exists when the save answers 404, leaves edit mode and lets the host clear it (H9)", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new HttpError(404, { errors: SCHEMA_NOT_FOUND_BODY as never }));
    const onSchemaGone = vi.fn();
    queryClient.setQueryData(["schema-details", "s1", "t1"], { data: {} });
    const removeQueries = vi.spyOn(queryClient, "removeQueries");
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    renderTable({ onSchemaGone });

    await editAndSave(user);

    await waitFor(() => expect(onSchemaGone).toHaveBeenCalledTimes(1));
    expect(showErrorToast).toHaveBeenCalledWith({ errors: "This schema no longer exists" });
    expect(editMode()).toBe("false");
    // Left the way Cancel leaves: the loaded rows are back.
    expect(rows()).toHaveLength(2);
    expect(onSchemaGone.mock.invocationCallOrder[0]).toBeLessThan(removeQueries.mock.invocationCallOrder[0]);
    expect(queryClient.getQueryState(["schema-details", "s1", "t1"])).toBeUndefined();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["unadapted-change-logs", "t1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["security-performance-schema-list", "t1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ predicate: expect.any(Function) });
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("shows the mapped index message for a recognised 400 and stays in edit mode (H12)", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new HttpError(400, { errors: { isSuccess: false, message: "FIELD_USED_BY_INDEX: idx_email", httpStatusCode: 400, data: null, errors: null } as never }),
    );
    const onSchemaGone = vi.fn();
    renderTable({ onSchemaGone });

    await editAndSave(user);

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "This field is used by index 'idx_email' and cannot be deleted." }),
    );
    expect(editMode()).toBe("true");
    expect(rows()).toHaveLength(1);
    expect(onSchemaGone).not.toHaveBeenCalled();
  });

  // The save endpoint's real validation body: HttpError.errors is the FluentValidation list itself.
  it("says what the server refused and keeps the unsaved rows (H4, H8, C11)", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new HttpError(400, {
        errors: [
          { propertyName: "Fields", errorMessage: "Field_Names_Must_Be_Unique.", attemptedValue: [], severity: 0, errorCode: "PredicateValidator" },
        ] as never,
      }),
    );
    renderTable();

    await editAndSave(user);

    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: ["Property names must be unique."] }));
    expect(editMode()).toBe("true");
    expect(rows()).toHaveLength(1);
  });

  it("keeps showing a dictionary body as it is (C5, E12)", async () => {
    const user = userEvent.setup();
    const errors = { Fields: ["Field names must be unique"] };
    mutateAsync.mockRejectedValue(new HttpError(400, { errors }));
    renderTable();

    await editAndSave(user);

    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors }));
    expect(editMode()).toBe("true");
    expect(rows()).toHaveLength(1);
  });

  it("keeps edit mode for a 500 as well (C11)", async () => {
    const user = userEvent.setup();
    const error = new HttpError(500, { errors: { general: "Something went wrong" } });
    mutateAsync.mockRejectedValue(error);
    renderTable();

    await editAndSave(user);

    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: error.errors }));
    expect(editMode()).toBe("true");
    expect(rows()).toHaveLength(1);
  });

  it("falls back to the generic message for a failure that is not an HttpError, with no unhandled rejection (C10)", async () => {
    const user = userEvent.setup();
    const unhandled = vi.fn();
    nodeProcess.on("unhandledRejection", unhandled);
    mutateAsync.mockRejectedValue(new TypeError("Failed to fetch"));
    const onSchemaGone = vi.fn();
    renderTable({ onSchemaGone });

    try {
      await editAndSave(user);
      await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: undefined }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      nodeProcess.off("unhandledRejection", unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
    expect(editMode()).toBe("true");
    expect(rows()).toHaveLength(1);
    expect(onSchemaGone).not.toHaveBeenCalled();
  });

  it("shows the empty state and lets you add a first property (child schema)", async () => {
    const user = userEvent.setup();
    renderTable({ schemaType: 2, schemaName: "Address", fields: [] });

    expect(
      screen.getAllByText(/Click Add Property to set one up/i).length,
    ).toBeGreaterThan(0);

    // EmptySchemaPropertyState is an inline component, so it remounts on every
    // parent render; let mount-time re-renders settle before the first click.
    await new Promise((r) => setTimeout(r, 50));
    await user.click(screen.getAllByRole("button", { name: "Add Property" })[0]);

    expect(screen.getByTestId("schema-header")).toHaveAttribute(
      "data-edit",
      "true",
    );
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
    await user.click(
      screen.getAllByRole("button", { name: "Open child schema" })[0],
    );
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
    expect(
      screen.queryByRole("button", { name: "+ Add property" }),
    ).not.toBeInTheDocument();
  });

  // The top-level table sits directly under SchemaBasicInfo's own card, which
  // dropped its bottom border for the same reason — the two should read as
  // one continuous panel, not two stacked cards with a gap between them. A
  // nested (embedded) child table has no card above it, so it keeps its own
  // full border.
  it("drops its own top border at the top level, but not when embedded", () => {
    const { container } = renderTable();
    expect(container.querySelector(".border-t-0")).toBeInTheDocument();
    expect(container.querySelector(".rounded-t-none")).toBeInTheDocument();
  });

  it("keeps its own top border when embedded in a parent row", () => {
    const { container } = renderTable({ compactView: true });
    expect(container.querySelector(".border-t-0")).not.toBeInTheDocument();
    expect(container.querySelector(".rounded-t-none")).not.toBeInTheDocument();
  });

  // Scrolling past the first several fields used to take the column header
  // with it, so a mid-scroll screenshot never named what you were looking at.
  it("keeps the column header pinned while the rows scroll under it", () => {
    const { container } = renderTable();
    const header = container.querySelector("thead");
    expect(header?.className).toContain("sticky");
    expect(header?.className).toContain("top-0");
  });

  it("opens a child-schema row as tree rows in the same table", async () => {
    const user = userEvent.setup();
    renderTable({
      fields: [{ name: "home", type: "Address", isArray: false }],
    });
    expect(screen.queryByTestId("tree-row")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "expand-0" }));

    expect(await screen.findByTestId("tree-row")).toHaveTextContent("home.street");
    // No embedded child table on the desktop path any more.
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "expand-0" }));
    expect(screen.queryByTestId("tree-row")).not.toBeInTheDocument();
  });

  it("closes the tree when edit mode starts", async () => {
    const user = userEvent.setup();
    renderTable({
      fields: [{ name: "home", type: "Address", isArray: false }],
    });
    await user.click(screen.getByRole("button", { name: "expand-0" }));
    expect(await screen.findByTestId("tree-row")).toBeInTheDocument();

    await user.click(screen.getByText("toggle-edit"));
    expect(screen.queryByTestId("tree-row")).not.toBeInTheDocument();
  });

  // ── Phase 6: what the edit will actually do ─────────────────────────────

  it("reads a rename as a rename, not a delete plus an add", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByText("toggle-edit"));
    await user.click(screen.getByText("rename-0"));

    expect(await screen.findByText("1 unsaved change")).toBeInTheDocument();
    expect(screen.getByText("email renamed to renamed-0")).toBeInTheDocument();
  });

  it("counts an added row and a rename separately", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByText("toggle-edit"));
    await user.click(screen.getByText("rename-0"));
    await user.click(screen.getByText("dup-1"));

    expect(await screen.findByText("2 unsaved changes")).toBeInTheDocument();
  });

  // Identity is the row id, so deleting the first row must not make the second
  // one look renamed.
  it("reports only the deleted row when an earlier row goes", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByText("toggle-edit"));
    await user.click(screen.getByText("del-0"));

    expect(await screen.findByText("1 unsaved change")).toBeInTheDocument();
    expect(screen.getByText("email removed")).toBeInTheDocument();
  });

  // Cancelling used to restore the original names onto the current rows by
  // index, so a delete anywhere but the end left rows wearing the wrong name.
  it("restores the loaded rows on cancel after a delete", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByText("toggle-edit"));
    await user.click(screen.getByText("del-0"));
    await waitFor(() => expect(rows()).toHaveLength(1));

    await user.click(screen.getByText("toggle-edit"));

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByTestId("row-name-0")).toHaveTextContent("email");
    expect(screen.getByTestId("row-name-1")).toHaveTextContent("age");
  });

  // ── #439: rejected saves, empty structures and the pending lock ─────────

  describe("save errors, empty structure and pending lock (#439)", () => {
    const EMPTY_MESSAGE = "Add at least one property before saving.";
    const CONNECTION_MESSAGE = "The schema could not be saved. Check your connection and try again.";
    const dirtyBarSave = () => screen.getByRole("button", { name: "Save" });
    const tooLong = () =>
      new HttpError(400, {
        errors: [
          {
            propertyName: "Fields[1].Name",
            errorMessage: "Field_Name_Length_Must_Be_Between_1_And_50_Characters.",
            attemptedValue: "a".repeat(51),
            severity: 0,
            errorCode: "LengthValidator",
          },
        ] as never,
      });

    /** Enters edit mode and deletes both loaded rows. */
    async function deleteEveryRow(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: "toggle-edit" }));
      await user.click(screen.getByRole("button", { name: "del-1" }));
      await user.click(screen.getByRole("button", { name: "del-0" }));
      await waitFor(() => expect(rows()).toHaveLength(0));
    }

    it("says a property is needed and holds Save back once every row is gone (H9, E6)", async () => {
      const user = userEvent.setup();
      renderTable();

      await deleteEveryRow(user);

      const message = await screen.findByRole("status");
      expect(message).toHaveTextContent(EMPTY_MESSAGE);
      expect(dirtyBarSave()).toBeDisabled();
      expect(dirtyBarSave()).toHaveAttribute("aria-describedby", message.id);
    });

    it("sends nothing and opens no dialog for an empty structure, whatever submits it (C1)", async () => {
      const user = userEvent.setup();
      renderTable();
      await deleteEveryRow(user);

      // The header's submit button reaches onSubmit even though the dirty bar's Save is disabled.
      await user.click(screen.getByRole("button", { name: "header-save" }));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("drops the message as soon as a row is added again (H10)", async () => {
      const user = userEvent.setup();
      renderTable();
      await deleteEveryRow(user);
      expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "+ Add property" }));

      await waitFor(() => expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument());
      expect(rows()).toHaveLength(1);
    });

    it("saves an Entity that keeps only its read-only base rows, as today (C14, E7)", async () => {
      const user = userEvent.setup();
      mutateAsync.mockResolvedValue({ isSuccess: true });
      renderTable({
        fields: [
          { name: "ItemId", type: "String", isArray: false },
          { name: "CreatedDate", type: "DateTime", isArray: false },
          { name: "email", type: "String", isArray: false },
        ],
      } as Partial<Props>);

      await user.click(screen.getByRole("button", { name: "toggle-edit" }));
      await user.click(screen.getByRole("button", { name: "del-2" }));
      await waitFor(() => expect(rows()).toHaveLength(2));
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();

      await user.click(dirtyBarSave());
      await user.click(await screen.findByRole("button", { name: "Update" }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync.mock.calls[0][0].fields.map((f: { name: string }) => f.name)).toEqual(["ItemId", "CreatedDate"]);
    });

    it("never shows a dirty bar or the message when embedded in a parent row (C15)", () => {
      renderTable({ schemaType: 2, schemaName: "Address", fields: [], compactView: true });

      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });

    it("holds Save back and ignores a submit while a save is pending (H12, C9, E14)", async () => {
      const user = userEvent.setup();
      saveState.isPending = true;
      renderTable();

      await user.click(screen.getByRole("button", { name: "toggle-edit" }));
      await user.click(screen.getByRole("button", { name: "del-0" }));
      await waitFor(() => expect(rows()).toHaveLength(1));

      expect(dirtyBarSave()).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "header-save" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("re-enables Save once the save settles", async () => {
      const user = userEvent.setup();
      saveState.isPending = true;
      const { rerender } = renderTable();
      await user.click(screen.getByRole("button", { name: "toggle-edit" }));
      await user.click(screen.getByRole("button", { name: "del-0" }));
      expect(dirtyBarSave()).toBeDisabled();

      saveState.isPending = false;
      rerender(
        <QueryClientProvider client={queryClient}>
          <SchemaStructureTable {...baseProps()} />
        </QueryClientProvider>,
      );

      expect(dirtyBarSave()).toBeEnabled();
    });

    it("names a connection failure in the genesis-os 4.5.0 shape and keeps the edits (H11, E8)", async () => {
      const user = userEvent.setup();
      mutateAsync.mockRejectedValue(new HttpError(500, { errors: new TypeError("Failed to fetch") as never }));
      renderTable();

      await editAndSave(user);

      await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: CONNECTION_MESSAGE }));
      expect(editMode()).toBe("true");
      expect(rows()).toHaveLength(1);
    });

    it("names a connection failure in the next genesis-os shape (H11, E9)", async () => {
      const user = userEvent.setup();
      mutateAsync.mockRejectedValue(new HttpError(500, { errors: { general: "Failed to fetch", message: "Failed to fetch" } }));
      renderTable();

      await editAndSave(user);

      await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: CONNECTION_MESSAGE }));
    });

    it("shows one line per distinct reason, in server order (H7, E3)", async () => {
      const user = userEvent.setup();
      mutateAsync.mockRejectedValue(
        new HttpError(400, {
          errors: [
            { errorMessage: "Field_EnumValues_Must_Be_Unique.", propertyName: "Fields[1].EnumValues" },
            { errorMessage: "Field_Type_Is_Not_Valid.", propertyName: "Fields[2].Type" },
            { errorMessage: "Field_EnumValues_Must_Be_Unique.", propertyName: "Fields[4].EnumValues" },
          ] as never,
        }),
      );
      renderTable();

      await editAndSave(user);

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith({
          errors: ["Allowed values must be unique.", "A property uses a type that does not exist. Choose another type."],
        }),
      );
    });

    it("maps the empty-structure rejection the server sends (H3)", async () => {
      const user = userEvent.setup();
      mutateAsync.mockRejectedValue(new HttpError(400, { errors: [{ propertyName: "Fields", errorMessage: "Fields_Are_Required.", attemptedValue: [] }] as never }));
      renderTable();

      await editAndSave(user);

      await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: [EMPTY_MESSAGE] }));
    });

    it("keeps the dialog closed, retries nothing and invalidates nothing after a rejection (C2, C10, C16, H5)", async () => {
      const user = userEvent.setup();
      const unhandled = vi.fn();
      nodeProcess.on("unhandledRejection", unhandled);
      mutateAsync.mockRejectedValue(tooLong());
      const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
      renderTable();

      try {
        await editAndSave(user);
        await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: ["Property names can be at most 50 characters."] }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      } finally {
        nodeProcess.off("unhandledRejection", unhandled);
      }

      expect(unhandled).not.toHaveBeenCalled();
      expect(mutateAsync).toHaveBeenCalledTimes(1);
      expect(invalidateQueries).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
      expect(editMode()).toBe("true");
    });

    it("saves with one more request once the rejected edit is fixed, without a reload (H8, H1)", async () => {
      const user = userEvent.setup();
      mutateAsync.mockRejectedValueOnce(tooLong()).mockResolvedValueOnce({ isSuccess: true });
      renderTable();

      await editAndSave(user);
      await waitFor(() => expect(showErrorToast).toHaveBeenCalledTimes(1));

      await user.click(dirtyBarSave());
      await user.click(await screen.findByRole("button", { name: "Update" }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(showSuccessToast).toHaveBeenCalledWith({ description: "Schema updated successfully" }));
      expect(editMode()).toBe("false");
    });
  });
});
