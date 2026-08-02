import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
let sectionsMock: Array<{ title: string; description: string; code: string }> = [];

// Heavy syntax highlighter + its style modules — replace with a trivial <pre>.
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children?: unknown }) => <pre>{children as string}</pre>,
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism/atom-dark", () => ({
  default: {},
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism/prism", () => ({
  default: {},
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({
    selectedProject: { itemId: "p1", tenantId: "t1", tenantSlug: "slug1", name: "Proj" },
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

vi.mock("@/hooks/use-project", () => ({
  useGetProject: () => ({ data: undefined }),
}));

vi.mock("@/hooks/use-scoped-path", () => ({
  useDataGatewayPath: () => "/data-gateway",
}));

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
  showSuccessToast: vi.fn(),
  showInfoToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

const useRawIntrospectionQuery = vi.fn();
vi.mock("../hooks/use-configuration", () => ({
  useRawIntrospectionQuery: (...args: unknown[]) => useRawIntrospectionQuery(...args),
}));

vi.mock("../utils/generate-preview-queries", () => ({
  buildPreviewSections: vi.fn(() => sectionsMock),
}));

import { SchemaPreviewDrawer } from "./schema-preview-drawer";

beforeEach(() => {
  navigate.mockReset();
  useRawIntrospectionQuery.mockReset();
  useRawIntrospectionQuery.mockReturnValue({
    data: undefined,
    isFetching: false,
    isPending: false,
  });
  sectionsMock = [];
  localStorage.clear();
});

function renderDrawer(props: Partial<Parameters<typeof SchemaPreviewDrawer>[0]> = {}) {
  return render(
    <SchemaPreviewDrawer
      trigger={<button>Open</button>}
      previewData={{ SchemaName: "User", id: "1" }}
      schemaName="User"
      schemaType={1}
      open
      {...props}
    />,
  );
}

describe("SchemaPreviewDrawer", () => {
  it("renders the entity view with both tabs and the operation sidebar", () => {
    useRawIntrospectionQuery.mockReturnValue({
      data: { __schema: {} },
      isFetching: false,
      isPending: false,
    });
    renderDrawer();

    expect(screen.getByText("User preview")).toBeInTheDocument();
    expect(screen.getByText("Request Format")).toBeInTheDocument();
    expect(screen.getByText("Schema Structure")).toBeInTheDocument();
    ["Query", "Insert", "Update", "Delete"].forEach((label) =>
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument(),
    );
    // Connection info reflects the project key from the store.
    expect(screen.getByText(/x-blocks-key: t1/)).toBeInTheDocument();
  });

  it("filters the example sections by the selected operation", async () => {
    const user = userEvent.setup();
    sectionsMock = [
      { title: "Query", description: "Fetch data", code: "query { getUsers { items } }" },
      { title: "Insert", description: "Add entry", code: "mutation { insertUser }" },
      { title: "Insert Many", description: "Add entries", code: "mutation { insertManyUser }" },
    ];
    renderDrawer({ rawIntrospection: { __schema: {} } });

    // Default operation is "query".
    expect(screen.getByText("Fetch data")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Insert" }));
    expect(await screen.findByText("Add entry")).toBeInTheDocument();
    expect(screen.getByText("Add entries")).toBeInTheDocument();
    expect(screen.queryByText("Fetch data")).not.toBeInTheDocument();
  });

  it("writes the query to localStorage and navigates on Playground click", async () => {
    const user = userEvent.setup();
    sectionsMock = [{ title: "Query", description: "Fetch data", code: "QUERY_CODE" }];
    renderDrawer({ rawIntrospection: { __schema: {} } });

    await user.click(screen.getByRole("button", { name: /Playground/ }));

    expect(localStorage.getItem("graphql-playground-query")).toBe("QUERY_CODE");
    expect(navigate).toHaveBeenCalledWith("/data-gateway/playground");
  });

  it("shows the empty state when there are no example sections", () => {
    sectionsMock = [];
    renderDrawer({ rawIntrospection: { __schema: {} } });

    expect(screen.getByText("No examples available")).toBeInTheDocument();
  });

  it("shows the gateway loading spinner while introspection is pending", () => {
    renderDrawer({
      rawIntrospection: {},
      isGatewayIntrospectionPending: true,
    });

    expect(screen.getByText(/Loading from gateway/)).toBeInTheDocument();
  });

  it("renders the child view (schema structure) with the Request Format tab for introspection-driven query/mutations", () => {
    sectionsMock = [
      { title: "Query", description: "Fetch data", code: "query { getUsers { items } }" },
    ];
    renderDrawer({ schemaType: 1, rawIntrospection: { __schema: {} } });

    expect(screen.getByText("Request Format")).toBeInTheDocument();
    expect(screen.getByText("Schema Structure")).toBeInTheDocument();
  });

  it("shows introspection-driven query/mutations for child schemas when Request Format tab is selected", async () => {
    const user = userEvent.setup();
    sectionsMock = [
      { title: "Query", description: "Fetch data", code: "query { getUsers { items } }" },
      { title: "Insert", description: "Add entry", code: "mutation { insertUser }" },
    ];
    renderDrawer({ schemaType: 1, rawIntrospection: { __schema: {} } });

    await user.click(screen.getByRole("tab", { name: "Request Format" }));
    expect(await screen.findByText("Fetch data")).toBeInTheDocument();
  });

  it("uses the title prop for the heading when provided", () => {
    renderDrawer({ title: "Custom Preview" });

    expect(screen.getByText("Custom Preview")).toBeInTheDocument();
    expect(screen.queryByText("User preview")).not.toBeInTheDocument();
  });
});
