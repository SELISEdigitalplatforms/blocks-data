import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSchemaList } from "../../hooks/use-configuration";
import type { IField, ISchemaDetails } from "../../models/data-service";
import { buildEntityShape } from "../../rest/entity-shape";
import { buildRestRequests } from "../../rest/request-templates";
import { RequestsDrawer } from "./requests-drawer";
import { loadTemplate } from "./rest-workspace";

let pendingSchemaIds: ReadonlySet<string> = new Set();

vi.mock("../../hooks/use-configuration", () => ({
  useSchemaList: vi.fn(),
  usePendingSchemaIds: () => pendingSchemaIds,
}));

vi.mock("@seliseblocks/genesis-os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@seliseblocks/genesis-os")>()),
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("../../rest/entity-shape", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../rest/entity-shape")>();
  return { ...actual, buildEntityShape: vi.fn(actual.buildEntityShape) };
});

const field = (name: string, type: string) => ({ name, type, isArray: false }) as IField;
const schema = (schemaName: string, schemaType: number, extra: Partial<ISchemaDetails> = {}) =>
  ({
    id: `id-${schemaName}`,
    schemaName,
    schemaType,
    fields: [field("Name", "String")],
    ...extra,
  }) as ISchemaDetails;

const ENTITIES = [schema("Employee", 1), schema("Order", 1), schema("blocklist", 1)];
const DTOS = [schema("AddressDto", 2)];

type ListState = {
  entities?: ISchemaDetails[];
  isPending?: boolean;
  isError?: boolean;
  /** A failed refetch keeps the data already loaded, as react-query does. */
  keepData?: boolean;
  refetch?: () => void;
};
const mockLists = ({
  entities = ENTITIES,
  isPending = false,
  isError = false,
  keepData = false,
  refetch = vi.fn(),
}: ListState = {}) => {
  // Built once, like react-query's structurally shared data: a new object per render would change the memo inputs.
  const data = (items: ISchemaDetails[]) => (isPending || (isError && !keepData) ? undefined : { data: { items } });
  const entityResult = { isPending, isError, refetch, data: data(entities) };
  const dtoResult = { isPending, isError, refetch, data: data(DTOS) };
  vi.mocked(useSchemaList).mockImplementation(
    ({ schemaType }) => (schemaType === 1 ? entityResult : dtoResult) as unknown as ReturnType<typeof useSchemaList>,
  );
};

const renderDrawer = () => {
  const onUseRequest = vi.fn();
  const onOpenChange = vi.fn();
  render(<RequestsDrawer open onOpenChange={onOpenChange} onUseRequest={onUseRequest} />);
  return { onUseRequest, onOpenChange };
};

// A live-state label joins the name as "name · label", so match the name as a prefix.
const entityToggle = (name: string) =>
  screen.getByRole("button", { name: (accessibleName) => accessibleName === name || accessibleName.startsWith(`${name} ·`) });

// Every operation button is named after its own request, e.g. "Use in builder: GET /Employee".
const USE_BUTTON = { name: /^Use in builder: / };

beforeEach(() => {
  vi.clearAllMocks();
  pendingSchemaIds = new Set();
  mockLists();
});

describe("RequestsDrawer", () => {
  it("lists entities only, loading them with schemaType 1", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: "Employee" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Order" })).toBeInTheDocument();
    expect(screen.queryByText("AddressDto")).not.toBeInTheDocument();
    expect(useSchemaList).toHaveBeenCalledWith(
      expect.objectContaining({ projectKey: "t1", schemaType: 1, pageSize: 200 }),
    );
  });

  it("filters entities by name, ignoring case", async () => {
    renderDrawer();
    await userEvent.type(screen.getByPlaceholderText("Search entities"), "BLOCK");
    expect(screen.getByRole("button", { name: "blocklist" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Employee" })).not.toBeInTheDocument();
  });

  it("says when nothing matches the search", async () => {
    renderDrawer();
    await userEvent.type(screen.getByPlaceholderText("Search entities"), "zzz");
    expect(screen.getByText("No entities match your search.")).toBeInTheDocument();
  });

  it("shows a loading state while the list is pending", () => {
    mockLists({ isPending: true });
    renderDrawer();
    expect(screen.getByText("Loading entities")).toBeInTheDocument();
    expect(screen.queryByText("This project has no entities yet.")).not.toBeInTheDocument();
  });

  it("shows an error with a Retry button when the entity list fails, not the empty state", async () => {
    const refetch = vi.fn();
    mockLists({ isError: true, refetch });
    renderDrawer();
    expect(screen.getByText("Couldn't load the entities. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("This project has no entities yet.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the loaded list when a background refetch fails", () => {
    mockLists({ isError: true, keepData: true });
    renderDrawer();
    expect(screen.getByRole("button", { name: "Employee" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the entities. Try again.")).not.toBeInTheDocument();
  });

  it("shows an empty state when the project has no entities", () => {
    mockLists({ entities: [] });
    renderDrawer();
    expect(screen.getByText("This project has no entities yet.")).toBeInTheDocument();
  });

  it("shows no operations until an entity is expanded, then the ten operations", async () => {
    renderDrawer();
    expect(screen.queryByRole("button", USE_BUTTON)).not.toBeInTheDocument();
    await userEvent.click(entityToggle("Employee"));
    expect(entityToggle("Employee")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", USE_BUTTON)).toHaveLength(10);
    for (const verb of ["query", "insertMany", "updateMany", "deleteMany"]) {
      expect(screen.getByText(`/Employee:${verb}`, { selector: "code" })).toBeInTheDocument();
    }
    expect(screen.getByText("List records")).toBeInTheDocument();
    expect(screen.getAllByText("/Employee/{itemId}", { selector: "code" })).toHaveLength(4);
    await userEvent.click(entityToggle("Employee"));
    expect(screen.queryByRole("button", USE_BUTTON)).not.toBeInTheDocument();
  });

  it("gives each Use in builder button its own accessible name", async () => {
    renderDrawer();
    await userEvent.click(entityToggle("Employee"));
    const names = screen.getAllByRole("button", USE_BUTTON).map((b) => b.getAttribute("aria-label"));
    expect(names).toHaveLength(10);
    expect(new Set(names).size).toBe(10);
    expect(names).toContain("Use in builder: GET /Employee");
    expect(screen.getByRole("button", { name: "Use in builder: GET /Employee" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use in builder: POST /Employee:query" })).toBeInTheDocument();
  });

  it("shows a method badge on every operation", async () => {
    renderDrawer();
    await userEvent.click(entityToggle("Employee"));
    const methods = screen.getAllByTestId("request-method").map((el) => el.textContent);
    expect(methods.sort()).toEqual(
      buildRestRequests(buildEntityShape(ENTITIES[0], [...ENTITIES, ...DTOS]))
        .map((t) => t.method)
        .sort(),
    );
    expect(new Set(methods)).toEqual(new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]));
  });

  it("builds a shape only for the expanded entity", async () => {
    renderDrawer();
    expect(buildEntityShape).not.toHaveBeenCalled();
    await userEvent.click(entityToggle("Order"));
    const built = vi.mocked(buildEntityShape).mock.calls.map(([s]) => s.schemaName);
    expect(new Set(built)).toEqual(new Set(["Order"]));
  });

  it("does not rebuild the shape of an expanded entity while searching", async () => {
    renderDrawer();
    await userEvent.click(entityToggle("Employee"));
    const callsAfterExpand = vi.mocked(buildEntityShape).mock.calls.length;
    expect(callsAfterExpand).toBeGreaterThan(0);
    await userEvent.type(screen.getByPlaceholderText("Search entities"), "emp");
    expect(screen.getByRole("button", { name: "Employee" })).toHaveAttribute("aria-expanded", "true");
    expect(vi.mocked(buildEntityShape).mock.calls).toHaveLength(callsAfterExpand);
  });

  it("loads the chosen operation into the builder and closes", async () => {
    const { onUseRequest, onOpenChange } = renderDrawer();
    await userEvent.click(entityToggle("Employee"));
    const templates = buildRestRequests(buildEntityShape(ENTITIES[0], [...ENTITIES, ...DTOS]));
    const insert = templates.find((t) => t.id === "insert")!;
    const row = screen.getByText("Insert a record").closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", USE_BUTTON));
    expect(onUseRequest).toHaveBeenCalledTimes(1);
    expect(onUseRequest).toHaveBeenCalledWith(loadTemplate(insert));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("marks entities that are not live or have unpublished changes", () => {
    mockLists({
      entities: [
        schema("Employee", 1, { isLive: false }),
        schema("Order", 1, { isLive: true }),
        schema("Invoice", 1, { isLive: true }),
      ],
    });
    pendingSchemaIds = new Set(["id-Order"]);
    renderDrawer();
    expect(within(entityToggle("Employee")).getByText("Not live")).toBeInTheDocument();
    expect(within(entityToggle("Order")).getByText("Unpublished changes")).toBeInTheDocument();
    expect(within(entityToggle("Invoice")).queryByText(/Not live|Unpublished/)).not.toBeInTheDocument();
    // The name and the label are joined explicitly, as in the schema rail.
    expect(screen.getByRole("button", { name: "Employee · Not live" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Order · Unpublished changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invoice" })).toBeInTheDocument();
  });

  it("closes from the close button", async () => {
    const { onOpenChange } = renderDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Close requests drawer" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
