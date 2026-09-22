import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const navigateMock = vi.fn();
const setQueryParams = vi.fn();
const useDataGatewaySearchParams = vi.fn();
const useGetUnadaptedChangeLogs = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../hooks/use-data-gateway-search-params", () => ({
  useDataGatewaySearchParams: () => useDataGatewaySearchParams(),
}));

vi.mock("../hooks/use-configuration", () => ({
  getPolicyDataQueryOptions: () => ({
    queryKey: ["p"],
    queryFn: () => Promise.resolve(null),
  }),
  useCreateSchema: () => ({ mutateAsync: vi.fn() }),
  useGetUnadaptedChangeLogs: () => useGetUnadaptedChangeLogs(),
  useSchemaDetails: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/dg" }));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));
vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "http://x" }));

vi.mock("./schema-structure", () => ({
  default: ({
    onOpenFieldAccess,
  }: {
    onOpenFieldAccess?: (t: {
      fieldNames: string[];
      subject: string;
      context: string;
    }) => void;
  }) => (
    <div data-testid="schema-structure">
      <button
        onClick={() =>
          onOpenFieldAccess?.({
            fieldNames: ["Email"],
            subject: "Email",
            context: "Field on Orders",
          })
        }
      >
        open-field-access
      </button>
    </div>
  ),
}));
vi.mock("./security-and-performance/security-and-performance", () => ({
  default: () => <div data-testid="security-view" />,
}));
vi.mock("./schema-side-bar", () => ({
  default: () => <div data-testid="sidebar" />,
}));
vi.mock("./schema-basic-info", () => ({
  SchemaBasicInfo: ({ onOpenSchemaAccess }: { onOpenSchemaAccess?: (t: string) => void }) => (
    <div data-testid="basic-info">
      <button onClick={() => onOpenSchemaAccess?.("Create")}>open-schema-access</button>
    </div>
  ),
}));
vi.mock("./add-edit-schema", () => ({
  AddEditSchemaModal: () => <div data-testid="add-edit" />,
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

describe("SchemaDetailsPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setQueryParams.mockReset();
    useGetUnadaptedChangeLogs.mockReset();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [] } });
  });

  it("always renders the schema view — security is its own route now", () => {
    useDataGatewaySearchParams.mockReturnValue([
      { type: "all", schemaId: null, page: 1, pageSize: 10 },
      setQueryParams,
    ]);
    renderPage();

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("security-view")).not.toBeInTheDocument();
  });

  it("renders the schema view even with no type param, where the security landing used to appear", () => {
    useDataGatewaySearchParams.mockReturnValue([
      { type: null, schemaId: null, page: 1, pageSize: 10 },
      setQueryParams,
    ]);
    renderPage();

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("security-view")).not.toBeInTheDocument();
  });

  it("heads the page with the shared page bar", () => {
    useDataGatewaySearchParams.mockReturnValue([
      { type: "all", schemaId: null, page: 1, pageSize: 10 },
      setQueryParams,
    ]);
    renderPage();

    expect(screen.getByTestId("page-bar")).toBeInTheDocument();
  });

  it("no longer reads the unadapted change log — the page bar owns publishing", () => {
    useDataGatewaySearchParams.mockReturnValue([
      { type: "all", schemaId: "s1", page: 1, pageSize: 10 },
      setQueryParams,
    ]);
    renderPage();

    expect(useGetUnadaptedChangeLogs).not.toHaveBeenCalled();
    expect(screen.queryByText(/You have unadapted changes/i)).not.toBeInTheDocument();
  });
  // ── Phase 5: the docked access inspector ────────────────────────────────

  const withSchema = () =>
    useDataGatewaySearchParams.mockReturnValue([
      { type: "all", schemaId: "s1", page: 1, pageSize: 10 },
      setQueryParams,
    ]);

  it("keeps the inspector shut until something asks for access", () => {
    withSchema();
    renderPage();

    expect(screen.queryByTestId("access-inspector")).not.toBeInTheDocument();
  });

  it("opens the inspector on the field that was clicked", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    // Mobile and desktop both mount the table; only the desktop one docks.
    await user.click(screen.getAllByText("open-field-access").at(-1)!);
    expect(screen.getByTestId("access-inspector")).toHaveTextContent("Email");
  });

  it("opens the inspector on the schema from the access pills", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    await user.click(screen.getAllByText("open-schema-access").at(-1)!);
    expect(screen.getByTestId("access-inspector")).toBeInTheDocument();
  });
});
