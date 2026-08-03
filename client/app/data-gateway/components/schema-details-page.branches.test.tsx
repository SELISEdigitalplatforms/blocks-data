import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const navigateMock = vi.fn();
const setQueryParams = vi.fn();
const createSchema = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

let params: Record<string, unknown> = {
  type: "all",
  schemaId: "s1",
  page: 2,
  pageSize: 20,
};

const schemaData = {
  id: "s1",
  schemaName: "Products",
  schemaType: 1,
  collectionName: "products",
  fields: [],
  totalPermissions: 1,
  totalUsers: 2,
  totalRoles: 3,
  readAccess: null,
  writeAccess: null,
  deleteAccess: null,
  projectKey: "t1",
  isRlsEnabled: true,
  isClsEnabled: false,
  projectShortKey: "PRD",
  totalSchemaReferences: 0,
  schemaReferences: [],
  readAccessLevel: 1,
  writeAccessLevel: 1,
  editAccessLevel: 1,
  deleteAccessLevel: 1,
};

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../hooks/use-data-gateway-search-params", () => ({
  useDataGatewaySearchParams: () => [params, setQueryParams],
}));

// Stable references so effect deps ([schemaDetailsQuery], [unAdaptedChangeLogs])
// do not change every render (which would trigger an infinite update loop).
const policyOptions = { queryKey: ["p"], queryFn: () => Promise.resolve(null) };
const createSchemaHook = { mutateAsync: createSchema };
const changeLogsResult = { data: { data: [] as unknown[] } };
const schemaDetailsResult = { data: { data: schemaData }, isLoading: false };

vi.mock("../hooks/use-configuration", () => ({
  getPolicyDataQueryOptions: () => policyOptions,
  useCreateSchema: () => createSchemaHook,
  useGetUnadaptedChangeLogs: () => changeLogsResult,
  useSchemaDetails: () => schemaDetailsResult,
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/dg" }));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "http://api" }));

vi.mock("./schema-structure", () => ({
  default: ({
    onOpenStandaloneSchemaEditor,
  }: {
    onOpenStandaloneSchemaEditor: (id: string) => void;
  }) => (
    <button
      data-testid="open-standalone"
      onClick={() => onOpenStandaloneSchemaEditor("s9")}
    >
      structure
    </button>
  ),
}));
vi.mock("./security-and-performance/security-and-performance", () => ({
  default: ({
    onSchemaRowClick,
    onSchemaCreated,
    onNavigateToSchemas,
  }: {
    onSchemaRowClick: (s: { id: string }) => void;
    onSchemaCreated: (id: string) => void;
    onNavigateToSchemas: () => void;
  }) => (
    <div>
      <button onClick={() => onSchemaRowClick({ id: "row1" })}>row-click</button>
      <button onClick={() => onSchemaCreated("created1")}>created</button>
      <button onClick={() => onNavigateToSchemas()}>to-schemas</button>
    </div>
  ),
}));
vi.mock("./schema-side-bar", () => ({
  default: ({ onAddSchema }: { onAddSchema: () => void }) => (
    <button data-testid="add-schema" onClick={onAddSchema}>
      sidebar
    </button>
  ),
}));
vi.mock("./schema-basic-info", () => ({
  SchemaBasicInfo: ({ onDeleteSuccess }: { onDeleteSuccess: () => void }) => (
    <button data-testid="delete-success" onClick={onDeleteSuccess}>
      basic
    </button>
  ),
}));
vi.mock("./add-edit-schema", () => ({
  AddEditSchemaModal: ({
    onSubmit,
    onCancel,
  }: {
    onSubmit: (v: {
      schemaName: string;
      schemaType: string;
      entityName: string;
    }) => Promise<boolean>;
    onCancel: () => void;
  }) => (
    <div>
      <button
        data-testid="submit-entity"
        onClick={() =>
          void onSubmit({ schemaName: "N", schemaType: "Entity", entityName: "E" })
        }
      >
        submit-entity
      </button>
      <button
        data-testid="submit-collection"
        onClick={() =>
          void onSubmit({ schemaName: "N", schemaType: "Collection", entityName: "" })
        }
      >
        submit-collection
      </button>
      <button data-testid="cancel" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
}));
vi.mock("./data-gateway-actions", () => ({
  DataGatewayActions: () => <div data-testid="actions" />,
}));

import { SchemaDetailsPage } from "./schema-details-page";

function renderPage() {
  const Wrapper = createWrapper();
  render(
    <Wrapper>
      <SchemaDetailsPage />
    </Wrapper>,
  );
}

describe("SchemaDetailsPage - interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params = { type: "all", schemaId: "s1", page: 2, pageSize: 20 };
    createSchema.mockResolvedValue({ isSuccess: true, data: { itemId: "new1" } });
  });

  it("hydrates schema details from the query into the basic info panel", () => {
    renderPage();
    // The effect maps query data into local state; the two-panel view renders.
    expect(screen.getAllByTestId("delete-success").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("open-standalone").length).toBeGreaterThan(0);
  });

  it("opens API docs in a new window", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderPage();
    await user.click(screen.getByRole("button", { name: /API Docs/ }));
    expect(openSpy).toHaveBeenCalledWith(
      "http://api/swagger/index.html",
      "_blank",
    );
    openSpy.mockRestore();
  });

  it("creates an Entity schema and navigates to it on success", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("add-schema"));
    await user.click(screen.getByTestId("submit-entity"));
    await waitFor(() => expect(createSchema).toHaveBeenCalled());
    expect(createSchema.mock.calls[0][0]).toMatchObject({
      schemaName: "N",
      collectionName: "E",
      schemaType: 1,
    });
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    expect(setQueryParams).toHaveBeenCalledWith(
      expect.objectContaining({ type: "all", schemaId: "new1" }),
      { history: "push" },
    );
  });

  it("creates a Collection schema with an empty collection name", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("add-schema"));
    await user.click(screen.getByTestId("submit-collection"));
    await waitFor(() => expect(createSchema).toHaveBeenCalled());
    expect(createSchema.mock.calls[0][0]).toMatchObject({
      collectionName: "",
      schemaType: 2,
    });
  });

  it("shows an error toast when creation is unsuccessful", async () => {
    createSchema.mockResolvedValue({ isSuccess: false, errors: ["bad"] });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("add-schema"));
    await user.click(screen.getByTestId("submit-entity"));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: ["bad"] }));
  });

  it("shows a fallback error toast when creation throws", async () => {
    createSchema.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("add-schema"));
    await user.click(screen.getByTestId("submit-entity"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: ["An unexpected error occurred"],
      }),
    );
    errSpy.mockRestore();
  });

  it("closes the modal via cancel", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("add-schema"));
    expect(screen.getByTestId("cancel")).toBeInTheDocument();
    await user.click(screen.getByTestId("cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("cancel")).not.toBeInTheDocument(),
    );
  });

  it("resets details and clears the schemaId on delete", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByTestId("delete-success")[0]);
    expect(setQueryParams).toHaveBeenCalledWith(
      { schemaId: null },
      { history: "push" },
    );
  });

  it("opens a schema in the editor from the structure table", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByTestId("open-standalone")[0]);
    expect(setQueryParams).toHaveBeenCalledWith(
      expect.objectContaining({ type: "all", schemaId: "s9" }),
      { history: "push" },
    );
  });

  it("navigates via the mobile back button", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Back to schema list" }));
    expect(setQueryParams).toHaveBeenCalledWith(
      { schemaId: null },
      { history: "push" },
    );
  });

  describe("security landing callbacks", () => {
    beforeEach(() => {
      params = { type: null, schemaId: null, page: 1, pageSize: 10 };
    });

    it("routes a schema row click, a created schema, and navigate-to-schemas", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole("button", { name: "row-click" }));
      expect(setQueryParams).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "all", schemaId: "row1" }),
        { history: "push" },
      );
      await user.click(screen.getByRole("button", { name: "created" }));
      expect(setQueryParams).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "all", schemaId: "created1" }),
        { history: "push" },
      );
      await user.click(screen.getByRole("button", { name: "to-schemas" }));
      expect(setQueryParams).toHaveBeenLastCalledWith(
        { type: "all", page: 1, pageSize: 10, schemaId: null },
        { history: "push" },
      );
    });
  });
});
