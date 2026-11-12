import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// The real Node process: genesis-os replaces the global `process` in the browser bundle.
import nodeProcess from "node:process";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { MemoryRouter } from "react-router";

const navigateMock = vi.fn();
const setQueryParams = vi.fn();
const createSchema = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
const getSchemaDetails = vi.hoisted(() => vi.fn());

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

// Most tests use the fixed result above; the not-found tests switch to the real query hook
// (and the real HttpError), with only the service call stubbed.
const schemaDetailsHook = vi.hoisted(() => ({ useReal: false }));

vi.mock("../hooks/use-configuration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-configuration")>();
  return {
    getPolicyDataQueryOptions: () => policyOptions,
    useCreateSchema: () => createSchemaHook,
    useGetUnadaptedChangeLogs: () => changeLogsResult,
    useSchemaDetails: (...args: Parameters<typeof actual.useSchemaDetails>) =>
      schemaDetailsHook.useReal ? actual.useSchemaDetails(...args) : schemaDetailsResult,
    useSchemaList: () => ({ data: { data: { totalCount: 0 } } }),
    isSchemaNotFound: actual.isSchemaNotFound,
  };
});

vi.mock("../services/configuration.service", () => ({ configurationService: { getSchemaDetails } }));

vi.mock("@seliseblocks/genesis-os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@seliseblocks/genesis-os")>()),
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
    onSchemaGone,
  }: {
    onOpenStandaloneSchemaEditor: (id: string) => void;
    onSchemaGone?: () => void;
  }) => (
    <>
      <button
        data-testid="open-standalone"
        onClick={() => onOpenStandaloneSchemaEditor("s9")}
      >
        structure
      </button>
      <button data-testid="schema-gone" onClick={() => onSchemaGone?.()}>
        schema-gone
      </button>
    </>
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
// The explorer keeps both the sidebar and the rail mounted — it animates the
// column's width rather than swapping the two — so the rail is on screen here
// as well, and its useSchemaList call is outside this file's
// use-configuration mock.
vi.mock("./schema-rail", () => ({
  SchemaRail: () => <div data-testid="rail" />,
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
vi.mock("./page-bar", () => ({
  DataGatewayPageBar: () => <div data-testid="page-bar" />,
}));
// The inspector pulls in the whole access-control stack, which reaches the
// http client at import time; the page's job here is just to mount it.
vi.mock("./access-inspector", () => ({
  AccessInspector: ({ target }: { target: { subject: string } }) => (
    <div data-testid="access-inspector">{target.subject}</div>
  ),
}));
// Reaches the storage service's HttpClient construction at import time, same
// reason access-inspector is mocked above; the page's job here is just to
// mount it, not exercise the upload flow.
vi.mock("./import-schema-modal", () => ({
  default: () => <div data-testid="import-schema-modal" />,
}));

import { HttpError } from "@seliseblocks/genesis-os";
import { attachQueryErrorReporting } from "@seliseblocks/genesis-os/observability";
import { SchemaDetailsPage } from "./schema-details-page";

function renderPage() {
  const Wrapper = createWrapper();
  render(
    <Wrapper>
      <MemoryRouter initialEntries={["/dg"]}>
        <SchemaDetailsPage />
      </MemoryRouter>
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

  it("shows the server's message when creation is rejected with a 400", async () => {
    // H7: the HTTP client throws on a 400, with the parsed body as `errors`.
    createSchema.mockRejectedValue(
      Object.assign(new Error("HTTP 400"), {
        status: 400,
        errors: { isSuccess: false, message: "Collection name 'sb_E2eX' is already used by schema 'E2eY'", errors: null },
      }),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("add-schema"));
    await user.click(screen.getByTestId("submit-entity"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: ["Collection name 'sb_E2eX' is already used by schema 'E2eY'"],
      }),
    );
    // Rejected: the modal stays open.
    expect(screen.getByTestId("cancel")).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it("shows the fallback text for a 400 without a message", async () => {
    // C14
    createSchema.mockRejectedValue(Object.assign(new Error("HTTP 400"), { status: 400, errors: { message: "  " } }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("add-schema"));
    await user.click(screen.getByTestId("submit-entity"));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: ["An unexpected error occurred"] }),
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

  it("clears the selection when either structure table finds the schema gone on save (H9)", async () => {
    const user = userEvent.setup();
    renderPage();
    const [mobile, desktop] = screen.getAllByTestId("schema-gone");

    await user.click(mobile);
    await user.click(desktop);

    expect(setQueryParams).toHaveBeenCalledTimes(2);
    expect(setQueryParams).toHaveBeenNthCalledWith(1, { schemaId: null }, { history: "push" });
    expect(setQueryParams).toHaveBeenNthCalledWith(2, { schemaId: null }, { history: "push" });
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
});

describe("SchemaDetailsPage - schema not found", () => {
  const SCHEMA_NOT_FOUND_BODY = { isSuccess: false, message: "Schema not found", httpStatusCode: 404, data: null, errors: null };
  const notFound = () => new HttpError(404, { errors: SCHEMA_NOT_FOUND_BODY as never });
  const schemaNamed = (id: string, schemaName: string) => ({ data: { ...schemaData, id, schemaName } });
  const requestsFor = (id: string) => getSchemaDetails.mock.calls.filter(([requested]) => requested === id).length;

  let queryClient: QueryClient;
  const rollbar = { error: vi.fn() };
  const unhandled = vi.fn();
  let detachReporting: () => void;

  /** The app's query client (global retry: 1) with the app's error reporting attached. */
  function renderWithAppClient() {
    queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, retryDelay: 0 } } });
    detachReporting = attachQueryErrorReporting(queryClient, rollbar as never);
    const ui = () => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dg"]}>
          <SchemaDetailsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(ui());
    return { select: (schemaId: string | null) => { params = { ...params, schemaId }; view.rerender(ui()); } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    schemaDetailsHook.useReal = true;
    params = { type: "all", schemaId: "gone", page: 1, pageSize: 20 };
    getSchemaDetails.mockImplementation((id: string) => {
      if (id === "gone") return Promise.reject(notFound());
      if (id === "broken") return Promise.reject(new HttpError(500, { errors: {} }));
      return Promise.resolve(schemaNamed(id, id === "s2" ? "Orders" : "Products"));
    });
    nodeProcess.on("unhandledRejection", unhandled);
  });

  afterEach(() => {
    schemaDetailsHook.useReal = false;
    detachReporting?.();
    nodeProcess.off("unhandledRejection", unhandled);
  });

  it("shows the not-found panel instead of the details, at both widths, after one request (H4, C6, C7)", async () => {
    renderWithAppClient();

    // Mobile and desktop each render their own panel (CSS shows one).
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Schema not found" })).toHaveLength(2));
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getAllByText("This schema no longer exists or is not part of this project.")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Back to schemas" })).toHaveLength(2);
    expect(screen.queryByTestId("delete-success")).not.toBeInTheDocument();
    expect(screen.queryByTestId("open-standalone")).not.toBeInTheDocument();
    // The mobile header keeps its back arrow.
    expect(screen.getByRole("button", { name: "Back to schema list" })).toBeInTheDocument();

    // A refocused tab doesn't ask again, and the panel stays.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    focusManager.setFocused(undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getAllByRole("heading", { name: "Schema not found" })).toHaveLength(2);
    expect(requestsFor("gone")).toBe(1);
    expect(rollbar.error).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("goes back to the schema list with a history push (H5)", async () => {
    const user = userEvent.setup();
    renderWithAppClient();
    const [, desktopBack] = await screen.findAllByRole("button", { name: "Back to schemas" });

    await user.click(desktopBack);

    expect(setQueryParams).toHaveBeenCalledWith({ schemaId: null }, { history: "push" });
  });

  it("shows nothing of the previous schema under a missing one, and a later schema loads normally (C8, H6)", async () => {
    params = { ...params, schemaId: "s1" };
    const { select } = renderWithAppClient();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument());

    select("gone");

    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Schema not found" })).toHaveLength(2));
    expect(screen.queryByText("Products")).not.toBeInTheDocument();
    expect(screen.queryByTestId("delete-success")).not.toBeInTheDocument();
    expect(screen.queryByTestId("open-standalone")).not.toBeInTheDocument();
    expect(screen.queryByTestId("access-inspector")).not.toBeInTheDocument();

    select("s2");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Schema not found" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("delete-success").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("open-standalone").length).toBeGreaterThan(0);
    expect(requestsFor("gone")).toBe(1);
  });

  it("keeps today's rendering for errors other than 404", async () => {
    params = { ...params, schemaId: "broken" };
    renderWithAppClient();

    await waitFor(() => expect(queryClient.getQueryState(["schema-details", "broken", "t1"])?.status).toBe("error"));
    expect(requestsFor("broken")).toBe(2);
    expect(screen.queryByRole("heading", { name: "Schema not found" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("delete-success").length).toBeGreaterThan(0);
  });
});
