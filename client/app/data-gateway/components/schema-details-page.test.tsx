import { render, screen, waitFor } from "@testing-library/react";
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

// The page no longer animates through framer-motion — the columns are CSS
// width transitions on elements that stay mounted — so there is nothing left
// here to stub out.

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
  // The explorer no longer swaps the sidebar for the rail — both stay mounted
  // and the column's width transitions between them, so that the table beside
  // it grows once rather than lurching out to full width and back while one
  // panel unmounts and the other mounts. Which of the two is *presented* is
  // therefore a question of the column's width and each layer's aria-hidden,
  // not of what is in the document.
  it("collapses the schema list into a rail as soon as the inspector opens", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    const column = screen.getByTestId("explorer-column");
    const sidebarLayer = screen.getByTestId("explorer-sidebar-layer");
    const railLayer = screen.getByTestId("explorer-rail-layer");

    expect(column.dataset.collapsed).toBe("false");
    expect(column.style.getPropertyValue("--dg-explorer-w")).toBe("264px");
    expect(sidebarLayer).toHaveAttribute("aria-hidden", "false");
    expect(railLayer).toHaveAttribute("aria-hidden", "true");

    await user.click(screen.getAllByText("open-schema-access").at(-1)!);

    expect(column.dataset.collapsed).toBe("true");
    expect(column.style.getPropertyValue("--dg-explorer-w")).toBe("52px");
    expect(sidebarLayer).toHaveAttribute("aria-hidden", "true");
    expect(railLayer).toHaveAttribute("aria-hidden", "false");
  });

  it("opens the docked column at the inspector's width", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    const column = screen.getByTestId("inspector-column");
    expect(column.dataset.open).toBe("false");
    expect(column.style.getPropertyValue("--dg-inspector-w")).toBe("0px");

    await user.click(screen.getAllByText("open-schema-access").at(-1)!);

    expect(column.dataset.open).toBe("true");
    expect(column.style.getPropertyValue("--dg-inspector-w")).toBe("460px");
    // The panel inside keeps its own width so a close clips it away instead of
    // squeezing its contents down to nothing.
    expect(column.style.getPropertyValue("--dg-inspector-panel-w")).toBe("460px");
  });

  it("closes the inspector and restores the schema list from the rail", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    await user.click(screen.getAllByText("open-schema-access").at(-1)!);
    await user.click(screen.getByRole("button", { name: "Show the schema list" }));

    expect(screen.getByTestId("explorer-column").dataset.collapsed).toBe("false");
    expect(screen.getByTestId("explorer-sidebar-layer")).toHaveAttribute(
      "aria-hidden",
      "false",
    );

    const inspectorColumn = screen.getByTestId("inspector-column");
    expect(inspectorColumn.dataset.open).toBe("false");
    expect(inspectorColumn.style.getPropertyValue("--dg-inspector-w")).toBe("0px");
  });

  // The panel outlives the close by one collapse so the column has something
  // to shrink around, then unmounts.
  it("drops the inspector's contents once the collapse has run", async () => {
    const user = userEvent.setup();
    withSchema();
    renderPage();

    await user.click(screen.getAllByText("open-schema-access").at(-1)!);
    expect(screen.getByTestId("access-inspector")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show the schema list" }));
    await waitFor(() =>
      expect(screen.queryByTestId("access-inspector")).not.toBeInTheDocument(),
    );
  });
});
