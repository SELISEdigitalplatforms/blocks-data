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

// AnimatePresence's real exit animation keeps the outgoing element mounted
// for its transition duration, which would make the sidebar-vs-rail and
// inspector assertions below racy. The pass-through mock (same one
// guideline-wrapper.test.tsx uses) renders whichever child is current
// synchronously, with no animation delay to wait out.
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.ComponentProps<"div">) => <div {...p}>{children}</div>,
    button: ({ children, ...p }: React.ComponentProps<"button">) => <button {...p}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./schema-structure", () => ({
  default: ({
    onOpenFieldAccess,
    isPreviewOpen,
  }: {
    onOpenFieldAccess?: (t: {
      fieldNames: string[];
      subject: string;
      context: string;
    }) => void;
    isPreviewOpen?: boolean;
  }) => (
    <div data-testid="schema-structure" data-preview-open={String(!!isPreviewOpen)}>
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
// Real component calls useSchemaList, which isn't part of the
// use-configuration mock below (SchemasSidebar, which also calls it, is
// stubbed above for the same reason). The page's job here is just to mount
// it and wire onExpand, not exercise its own fetch.
vi.mock("./schema-rail", () => ({
  SchemaRail: ({ onExpand }: { onExpand: () => void }) => (
    <button type="button" onClick={onExpand}>
      Show the schema list
    </button>
  ),
}));
vi.mock("./schema-basic-info", () => ({
  SchemaBasicInfo: ({
    onOpenSchemaAccess,
    onOpenPreview,
  }: {
    onOpenSchemaAccess?: (t: string) => void;
    onOpenPreview?: () => void;
  }) => (
    <div data-testid="basic-info">
      <button onClick={() => onOpenSchemaAccess?.("Create")}>open-schema-access</button>
      <button onClick={() => onOpenPreview?.()}>open-preview</button>
    </div>
  ),
}));
vi.mock("./add-edit-schema", () => ({
  AddEditSchemaModal: ({ defaultValues }: { defaultValues?: { schemaType: string } }) => (
    <div data-testid="add-edit">{defaultValues?.schemaType ?? "no-kind"}</div>
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

  // ── The empty-canvas main panel: no schema selected (whether or not any
  //    exist), replacing the old bare "select a schema" fallback text. ──────

  describe("with nothing selected", () => {
    const withNoSelection = () =>
      useDataGatewaySearchParams.mockReturnValue([
        { type: "all", schemaId: null, page: 1, pageSize: 10 },
        setQueryParams,
      ]);

    // The mobile copy of basic-info/schema-structure still mounts (CSS-hidden,
    // per this suite's existing convention) — it's the desktop one only one
    // instance replaces, so check for the canvas rather than their absence.
    it("shows the create-first-schema canvas on the desktop panel", () => {
      withNoSelection();
      renderPage();

      expect(screen.getByText("Create your first schema")).toBeInTheDocument();
    });

    it("opens the add-schema modal defaulting to Entity from the New schema button", async () => {
      const user = userEvent.setup();
      withNoSelection();
      renderPage();

      await user.click(screen.getByRole("button", { name: /New schema/ }));
      expect(screen.getByTestId("add-edit")).toHaveTextContent("no-kind");
    });

    it("opens the add-schema modal pre-set to Entity from the Entity card", async () => {
      const user = userEvent.setup();
      withNoSelection();
      renderPage();

      await user.click(screen.getByText("Entity"));
      expect(screen.getByTestId("add-edit")).toHaveTextContent("Entity");
    });

    it("opens the add-schema modal pre-set to DTO (Child) from the Child card", async () => {
      const user = userEvent.setup();
      withNoSelection();
      renderPage();

      await user.click(screen.getByText("Child"));
      expect(screen.getByTestId("add-edit")).toHaveTextContent("DTO");
    });

    it("opens the import modal from Import from file", async () => {
      const user = userEvent.setup();
      withNoSelection();
      renderPage();

      expect(screen.queryByTestId("import-schema-modal")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Import from file/ }));
      expect(screen.getByTestId("import-schema-modal")).toBeInTheDocument();
    });
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

  // Preview's trigger moved out of the field table's own header, into
  // SchemaBasicInfo — but the actual drawer/data still lives in
  // SchemaStructureTable, so the open state has to be lifted up here and
  // shared between the two siblings.
  it("opens the preview drawer via the lifted state when Preview is clicked in SchemaBasicInfo", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    expect(screen.getAllByTestId("schema-structure").at(-1)).toHaveAttribute(
      "data-preview-open",
      "false",
    );

    await user.click(screen.getAllByText("open-preview").at(-1)!);

    expect(screen.getAllByTestId("schema-structure").at(-1)).toHaveAttribute(
      "data-preview-open",
      "true",
    );
  });

  // The sidebar used to fold only once the rule editor widened the inspector;
  // now it folds as soon as any inspector is docked, since the table can't
  // see past it to the sidebar either way.
  it("collapses the schema list into a rail as soon as the inspector opens", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show the schema list" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getAllByText("open-schema-access").at(-1)!);

    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show the schema list" }),
    ).toBeInTheDocument();
  });

  it("closes the inspector and restores the schema list from the rail", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    await user.click(screen.getAllByText("open-schema-access").at(-1)!);
    await user.click(screen.getByRole("button", { name: "Show the schema list" }));

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("access-inspector")).not.toBeInTheDocument();
  });
});
