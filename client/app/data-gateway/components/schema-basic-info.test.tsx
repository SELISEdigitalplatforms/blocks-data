import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";

const deleteAsync = vi.fn();
const toast = vi.fn();
const showErrorToast = vi.fn();
const useSchemaIndexes = vi.fn();
const getSchemaDetails = vi.hoisted(() => vi.fn());

vi.mock("./schema-access-control-drawer", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="access-drawer">{trigger}</div>
  ),
}));

let pendingSchemaIds: ReadonlySet<string> = new Set();

// The delete mutation is a stub; the schema-details query and the cache helpers are the real ones,
// so the tests see exactly which requests the details view makes around a delete.
vi.mock("../hooks/use-configuration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-configuration")>();
  return {
    useDeleteSchema: () => ({ isPending: false, mutateAsync: deleteAsync }),
    useSchemaIndexes: (...a: unknown[]) => useSchemaIndexes(...a),
    usePendingSchemaIds: () => pendingSchemaIds,
    useSchemaDetails: actual.useSchemaDetails,
    isSchemaNotFound: actual.isSchemaNotFound,
    removeSchemaDetails: actual.removeSchemaDetails,
    refreshSchemaLists: actual.refreshSchemaLists,
  };
});

vi.mock("../services/configuration.service", () => ({ configurationService: { getSchemaDetails } }));
vi.mock("@/lib/http-client", () => mockHttpClientFactory());

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...a: unknown[]) => toast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { HttpError } from "@/lib/http-client";
import { useSchemaDetails } from "../hooks/use-configuration";
import { SchemaBasicInfo } from "./schema-basic-info";

let queryClient: QueryClient;
function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
// The delete handler reads the query client.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers });

const SCHEMA_NOT_FOUND_BODY = { isSuccess: false, message: "Schema not found", httpStatusCode: 404, data: null, errors: null };

/**
 * The details page in miniature: it watches the selected schema's details and lets go of the id when
 * the basic info reports the schema gone, as SchemaDetailsPage does.
 */
function DetailsPageLike({ onDeleteSuccess }: Readonly<{ onDeleteSuccess: () => void }>) {
  const [selectedId, setSelectedId] = useState<string | null>("s1");
  useSchemaDetails(selectedId ?? "", "t1", { enabled: Boolean(selectedId) });
  return (
    <SchemaBasicInfo
      {...baseProps()}
      onDeleteSuccess={() => {
        onDeleteSuccess();
        setSelectedId(null);
      }}
    />
  );
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More options" }));
  await user.click(await screen.findByText("Delete schema"));
  await user.click(await screen.findByRole("button", { name: "Delete" }));
}

const detailsRequestsFor = (id: string) => getSchemaDetails.mock.calls.filter(([requested]) => requested === id).length;

type Props = Parameters<typeof SchemaBasicInfo>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    id: "s1",
    schemaName: "User",
    schemaType: 1,
    fields: [],
    readAccessLevel: 2,
    writeAccessLevel: 1,
    editAccessLevel: 3,
    deleteAccessLevel: 0,
    schemaReferences: [],
    ...overrides,
  } as Props;
}

describe("SchemaBasicInfo", () => {
  beforeEach(() => {
    pendingSchemaIds = new Set();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    deleteAsync.mockReset();
    toast.mockReset();
    showErrorToast.mockReset();
    getSchemaDetails.mockReset();
    getSchemaDetails.mockResolvedValue({ data: { id: "s1", schemaName: "User", fields: [] } });
    useSchemaIndexes.mockReset();
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes: [] } } });
  });

  it("renders the placeholder info card when no schema is selected", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaName: "" })} />);
    expect(screen.getByText("Basic Information")).toBeInTheDocument();
    expect(
      screen.getByText(/Select a schema from the sidebar/i),
    ).toBeInTheDocument();
  });

  it("renders entity header, access control label and the Schema Access trigger", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} />);
    expect(screen.getByRole("heading", { name: "User" })).toBeInTheDocument();
    expect(screen.getByText("Entity")).toBeInTheDocument();
    expect(screen.getByText("Access Control")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Schema Access/ }),
    ).toBeInTheDocument();
  });

  // Briefly changed to an even full-width grid, then reverted on request —
  // the pills should size to their own content, not stretch to fill the row.
  it("keeps the access-control pills sized to their content rather than stretched", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} />);
    const container = screen.getByText("View").closest("div");
    expect(container?.className).not.toContain("grid-cols-4");
    expect(screen.getByText("View").closest("button")?.className).not.toContain("w-full");
  });

  // The header used to say only "Entity" — nothing about the collection
  // behind it or how big the schema is.
  it("summarises the collection, custom/system field split and index count", () => {
    useSchemaIndexes.mockReturnValue({ data: { data: { indexes: [{}, {}, {}] } } });
    render(
      <SchemaBasicInfo
        {...baseProps({
          collectionName: "users",
          fields: [
            { name: "Email" },
            { name: "ItemId" },
            { name: "CreatedDate" },
          ] as never,
        })}
      />,
    );

    expect(screen.getByText("users")).toBeInTheDocument();
    // ItemId and CreatedDate are default (system) properties on an Entity.
    expect(screen.getByText("1 field · 2 system · 3 indexes")).toBeInTheDocument();
  });

  // Child schemas have no system split and no Indexes tab, so neither belongs
  // in their summary.
  it("counts a Child schema's fields with no system split or index count", () => {
    render(
      <SchemaBasicInfo
        {...baseProps({
          schemaType: 2,
          collectionName: "addresses",
          fields: [{ name: "Street" }, { name: "City" }] as never,
        })}
      />,
    );

    expect(screen.getByText("2 fields")).toBeInTheDocument();
    expect(useSchemaIndexes).toHaveBeenCalledWith("s1", { enabled: false });
  });

  it("shows references and a fallback for a child schema", () => {
    const { rerender } = render(
      <SchemaBasicInfo
        {...baseProps({ schemaType: 2, schemaReferences: ["Order", "Cart"] })}
      />,
    );
    expect(screen.getByText("References")).toBeInTheDocument();
    expect(screen.getByText("Order")).toBeInTheDocument();
    expect(screen.getByText("Cart")).toBeInTheDocument();

    rerender(
      <SchemaBasicInfo {...baseProps({ schemaType: 2, schemaReferences: [] })} />,
    );
    expect(screen.getByText("No references")).toBeInTheDocument();
  });

  it("deletes the schema and reports success on confirm", async () => {
    const user = userEvent.setup();
    deleteAsync.mockResolvedValue({ isSuccess: true });
    const onDeleteSuccess = vi.fn();
    render(<SchemaBasicInfo {...baseProps({ onDeleteSuccess })} />);

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete schema"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteAsync).toHaveBeenCalledWith({ id: "s1", projectKey: "t1" }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success" }),
      ),
    );
    await waitFor(() => expect(onDeleteSuccess).toHaveBeenCalled());
  });

  it("clears the selection before forgetting the deleted schema, and never asks for it again (H11, C9)", async () => {
    const user = userEvent.setup();
    deleteAsync.mockResolvedValue({ isSuccess: true });
    const removeQueries = vi.spyOn(queryClient, "removeQueries");
    const onDeleteSuccess = vi.fn();
    render(<DetailsPageLike onDeleteSuccess={onDeleteSuccess} />);
    await waitFor(() => expect(queryClient.getQueryData(["schema-details", "s1", "t1"])).toBeDefined());
    expect(detailsRequestsFor("s1")).toBe(1);

    await confirmDelete(user);

    await waitFor(() => expect(removeQueries).toHaveBeenCalledWith({ queryKey: ["schema-details", "s1", "t1"] }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success", description: "Deleted successfully" }));
    expect(onDeleteSuccess.mock.invocationCallOrder[0]).toBeLessThan(removeQueries.mock.invocationCallOrder[0]);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(detailsRequestsFor("s1")).toBe(1);
    expect(queryClient.getQueryState(["schema-details", "s1", "t1"])).toBeUndefined();
  });

  it("treats a schema that is already gone like a delete: closes, says so, clears and refreshes (H10)", async () => {
    const user = userEvent.setup();
    deleteAsync.mockRejectedValue(new HttpError(404, { errors: SCHEMA_NOT_FOUND_BODY as never }));
    const removeQueries = vi.spyOn(queryClient, "removeQueries");
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const onDeleteSuccess = vi.fn();
    render(<DetailsPageLike onDeleteSuccess={onDeleteSuccess} />);
    await waitFor(() => expect(detailsRequestsFor("s1")).toBe(1));

    await confirmDelete(user);

    await waitFor(() => expect(onDeleteSuccess).toHaveBeenCalledTimes(1));
    expect(showErrorToast).toHaveBeenCalledWith({ errors: "This schema no longer exists" });
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(onDeleteSuccess.mock.invocationCallOrder[0]).toBeLessThan(removeQueries.mock.invocationCallOrder[0]);
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: ["schema-details", "s1", "t1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["unadapted-change-logs", "t1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["security-performance-schema-list", "t1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ predicate: expect.any(Function) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(detailsRequestsFor("s1")).toBe(1);
  });

  it("keeps today's error toast and the selection for other delete failures (C11)", async () => {
    const user = userEvent.setup();
    const failure = new HttpError(500, { errors: { message: "boom" } });
    deleteAsync.mockRejectedValue(failure);
    const onDeleteSuccess = vi.fn();
    const removeQueries = vi.spyOn(queryClient, "removeQueries");
    render(<SchemaBasicInfo {...baseProps({ onDeleteSuccess })} />);

    await confirmDelete(user);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: JSON.stringify(failure) })),
    );
    expect(showErrorToast).not.toHaveBeenCalled();
    expect(onDeleteSuccess).not.toHaveBeenCalled();
    expect(removeQueries).not.toHaveBeenCalled();
  });
  // The type tag used to sit on its own line below the name; every design
  // board draws it inline beside the name instead.
  it("puts the type tag right beside the schema name, not on its own line", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} />);

    const heading = screen.getByRole("heading", { name: "User" });
    const tag = screen.getByText("Entity");
    expect(heading.parentElement).toBe(tag.parentElement);
  });
  // The verb ("Create") used to be bare text beside a separately-pilled tier
  // value; every board shares one bordered pill between the two.
  it("shares one pill between the verb and its tier value", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1, writeAccessLevel: 3 })} />);

    expect(screen.getByRole("button", { name: "Create Custom" })).toBeInTheDocument();
  });

  // This card used to have its own bottom border, and SchemaStructureTable
  // its own top border, with a gap between them — two visibly separate
  // cards where the board draws one continuous panel.
  it("drops its own bottom border so it reads as one panel with the table below it", () => {
    const { container } = render(<SchemaBasicInfo {...baseProps()} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain("border-b-0");
    expect(root.className).toContain("rounded-t-sm");
  });

  // Preview used to live down by the tabs, in the field table's own header —
  // moved here to sit beside Schema Access instead. It folds into the "⋮"
  // menu once the header is too narrow to hold it as its own button — jsdom
  // never fires ResizeObserver, so `isNarrow` stays false here and this stays
  // the wide-header case; the `isAccessPanelOpen` fold is a plain prop, so
  // that one's covered directly below without needing a real resize.
  it("shows a Preview button beside Schema Access and wires it through", async () => {
    const user = userEvent.setup();
    const onOpenPreview = vi.fn();
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} onOpenPreview={onOpenPreview} />);

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(onOpenPreview).toHaveBeenCalledTimes(1);
  });

  it("hides the Preview button when no handler is given", () => {
    render(<SchemaBasicInfo {...baseProps({ schemaType: 1 })} />);
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });

  // The inspector panel doesn't always narrow the header past its own pixel
  // threshold, so Preview folding needs to react to the panel being open at
  // all, not only to the header's own measured width.
  it("folds Preview into the \"⋮\" menu while the access panel is open, even at a wide header", async () => {
    const user = userEvent.setup();
    const onOpenPreview = vi.fn();
    render(
      <SchemaBasicInfo
        {...baseProps({ schemaType: 1 })}
        onOpenPreview={onOpenPreview}
        isAccessPanelOpen
      />,
    );

    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Preview"));
    expect(onOpenPreview).toHaveBeenCalledTimes(1);
  });

  it("says when the live version doesn't contain the schema", () => {
    render(<SchemaBasicInfo {...baseProps({ isLive: false })} />);
    expect(screen.getByText("Not live")).toBeInTheDocument();
    expect(screen.getByText(/Apps using the API can't query it until you publish/)).toBeInTheDocument();
  });

  it("says when the live version lacks the schema's latest changes", () => {
    pendingSchemaIds = new Set(["s1"]);
    render(<SchemaBasicInfo {...baseProps({ isLive: true })} />);
    expect(screen.getByText("Unpublished changes")).toBeInTheDocument();
    expect(screen.getByText(/Publish to apply them/)).toBeInTheDocument();
  });

  it("says nothing about a schema that matches the live version", () => {
    render(<SchemaBasicInfo {...baseProps({ isLive: true })} />);
    expect(screen.queryByText("Not live")).not.toBeInTheDocument();
    expect(screen.queryByText("Unpublished changes")).not.toBeInTheDocument();
  });
});
