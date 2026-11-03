import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISchemaDetails } from "../../models/data-service";
import { buildEntityShape, type EntityShape } from "../../rest/entity-shape";
import { buildRestRequests, type RestTemplateId } from "../../rest/request-templates";
import { toCurl, toFetch, toHttp } from "../../rest/snippets";

const navigate = vi.hoisted(() => vi.fn());
const deprecated = vi.hoisted(() => ({ value: false }));
const writePlaygroundHandoff = vi.hoisted(() => vi.fn());
let sectionsMock: Array<{ title: string; description: string; code: string }> = [];

// Heavy syntax highlighter and its style modules: a plain <pre> keeps the text.
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children, language }: { children?: unknown; language?: string }) => (
    <pre data-language={language}>{children as string}</pre>
  ),
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism/atom-dark", () => ({ default: {} }));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism/prism", () => ({ default: {} }));

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
vi.mock("@/hooks/use-project", () => ({ useGetProject: () => ({ data: undefined }) }));
vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/data-gateway" }));
vi.mock("react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../utils/graphql-deprecation", () => ({ isGraphQLDeprecated: () => deprecated.value }));
vi.mock("../../utils/playground-handoff", () => ({ writePlaygroundHandoff }));
vi.mock("../../utils/generate-preview-queries", () => ({
  buildPreviewSections: vi.fn(() => sectionsMock),
}));

import { SchemaPreviewDrawer } from "../schema-preview-drawer";
import { RestPreviewPanel } from "./rest-preview-panel";

const PUBLIC_URL = "https://api.example.test/data/";
const BASE = "https://api.example.test/data";

const schema = {
  id: "s1",
  schemaName: "RT_Blocklist",
  schemaType: 1,
  fields: [
    { name: "Name", type: "String", isArray: false },
    { name: "ValidUntil", type: "DateTime", isArray: false },
    { name: "ItemId", type: "String", isArray: false },
  ],
} as unknown as ISchemaDetails;

const shape: EntityShape = buildEntityShape(schema, [schema]);
const templates = buildRestRequests(shape);
const template = (id: RestTemplateId) => templates.find((t) => t.id === id)!;

const writeText = vi.fn();

beforeEach(() => {
  navigate.mockReset();
  writePlaygroundHandoff.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  deprecated.value = false;
  sectionsMock = [];
  Object.defineProperty(window, "isSecureContext", { value: true, writable: true, configurable: true });
});

/** user-event installs its own clipboard stub on setup, so the mock goes in after it. */
function setupWithClipboard() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true, configurable: true });
  return user;
}

function renderPanel(props: Partial<Parameters<typeof RestPreviewPanel>[0]> = {}) {
  return render(
    <RestPreviewPanel
      shape={shape}
      liveState={null}
      publicBaseUrl={PUBLIC_URL}
      blocksKey="t1"
      operationGroup="query"
      {...props}
    />,
  );
}

const cards = () => screen.getAllByRole("article");
const card = (title: string) => screen.getByRole("article", { name: title });

describe("RestPreviewPanel", () => {
  it("shows the entity base URL without a doubled slash, and both headers", () => {
    renderPanel();

    expect(screen.getByText("Base URL")).toBeInTheDocument();
    expect(screen.getByText(`${BASE}/RT_Blocklist`)).toBeInTheDocument();
    expect(screen.getByText("Headers")).toBeInTheDocument();
    expect(screen.getByText("x-blocks-key: t1")).toBeInTheDocument();
    expect(screen.getByText("Content-Type: application/json")).toBeInTheDocument();
  });

  it("copies the base URL and each header on click", async () => {
    const user = setupWithClipboard();
    renderPanel();

    const rowCopy = (text: string) => within(screen.getByText(text).parentElement!).getByRole("button");
    await user.click(rowCopy(`${BASE}/RT_Blocklist`));
    await user.click(rowCopy("x-blocks-key: t1"));
    await user.click(rowCopy("Content-Type: application/json"));

    expect(writeText.mock.calls).toEqual([
      [`${BASE}/RT_Blocklist`],
      ["x-blocks-key: t1"],
      ["Content-Type: application/json"],
    ]);
  });

  it("shows the three query cards for the Query group", () => {
    renderPanel();

    expect(cards()).toHaveLength(3);
    expect(
      cards().map((c) => [
        within(c).getByTestId("request-method").textContent,
        within(c).getByTestId("request-path").textContent,
      ]),
    ).toEqual([
      ["GET", "/"],
      ["POST", "/"],
      ["GET", "/item/{itemId}"],
    ]);
  });

  it("shows PATCH, PUT and PATCH /items cards for the Update group, with entity-relative path, title and description", () => {
    renderPanel({ operationGroup: "update" });

    expect(cards()).toHaveLength(3);
    expect(
      cards().map((c) => [
        within(c).getByTestId("request-method").textContent,
        within(c).getByTestId("request-path").textContent,
      ]),
    ).toEqual([
      ["PATCH", "/item/{itemId}"],
      ["PUT", "/item/{itemId}"],
      ["PATCH", "/items"],
    ]);
    const update = card("Update a record");
    expect(within(update).getByText("Change fields on one record by its item ID.")).toBeInTheDocument();
    expect(card("Upsert")).toBeInTheDocument();
    expect(card("Update many records")).toBeInTheDocument();
  });

  it("shows POST /item and POST /items cards for the Insert group, with entity-relative paths", () => {
    renderPanel({ operationGroup: "insert" });

    expect(cards()).toHaveLength(2);
    expect(
      cards().map((c) => [
        within(c).getByTestId("request-method").textContent,
        within(c).getByTestId("request-path").textContent,
      ]),
    ).toEqual([
      ["POST", "/item"],
      ["POST", "/items"],
    ]);
  });

  it("shows DELETE /item/{itemId} and DELETE /items cards for the Delete group, with entity-relative paths", () => {
    renderPanel({ operationGroup: "delete" });

    expect(cards()).toHaveLength(2);
    expect(
      cards().map((c) => [
        within(c).getByTestId("request-method").textContent,
        within(c).getByTestId("request-path").textContent,
      ]),
    ).toEqual([
      ["DELETE", "/item/{itemId}"],
      ["DELETE", "/items"],
    ]);
  });

  it("renders each card body as plain HTTP in the light and dark highlighters", () => {
    renderPanel({ operationGroup: "update" });

    const bodies = within(card("Update a record")).getAllByText(
      (_, element) => element?.tagName === "PRE" && element.textContent === toHttp(template("update")),
    );
    expect(bodies).toHaveLength(2);
    bodies.forEach((pre) => {
      expect(pre).toHaveAttribute("data-language", "http");
      // The body keeps the full gateway-relative path; only the header drops the entity.
      expect(pre.textContent).toMatch(/^PATCH \/RT_Blocklist\/item\/\{itemId\}\n/);
    });
  });

  it.each([
    ["HTTP", () => toHttp(template("update"))],
    ["curl", () => toCurl(template("update"), BASE, "t1")],
    ["fetch", () => toFetch(template("update"), BASE, "t1")],
  ])("copies the %s form from the Copy menu", async (item, expected) => {
    const user = setupWithClipboard();
    renderPanel({ operationGroup: "update" });

    await user.click(within(card("Update a record")).getByRole("button", { name: "Copy" }));
    await user.click(await screen.findByRole("menuitem", { name: item }));

    expect(writeText).toHaveBeenCalledWith(expected());
  });

  it("hands a request with a body to the playground and navigates there", async () => {
    const user = userEvent.setup();
    renderPanel({ operationGroup: "update" });

    await user.click(within(card("Update a record")).getByRole("button", { name: /Playground/ }));

    const t = template("update");
    expect(writePlaygroundHandoff).toHaveBeenCalledWith({
      protocol: "rest",
      method: "PATCH",
      path: "/RT_Blocklist/item/{itemId}",
      query: [],
      body: JSON.stringify(t.body, null, 2),
    });
    expect(navigate).toHaveBeenCalledWith("/data-gateway/playground");
  });

  it("hands a request without a body over with its query and no body", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(within(card("List records")).getByRole("button", { name: /Playground/ }));

    const handoff = writePlaygroundHandoff.mock.calls[0][0];
    expect(handoff).toEqual({
      protocol: "rest",
      method: "GET",
      path: "/RT_Blocklist",
      query: template("list").query,
      body: undefined,
    });
    expect(navigate).toHaveBeenCalledWith("/data-gateway/playground");
  });

  it("shows the not-live notice and still shows the cards", () => {
    renderPanel({ liveState: "not-live" });

    expect(
      screen.getByText("This schema isn't published yet. Publish it to call these requests."),
    ).toBeInTheDocument();
    expect(cards()).toHaveLength(3);
  });

  it("shows the unpublished notice and still shows the cards", () => {
    renderPanel({ liveState: "unpublished" });

    expect(
      screen.getByText("This schema has unpublished changes. Publish them before calling these requests."),
    ).toBeInTheDocument();
    expect(cards()).toHaveLength(3);
  });

  it("shows no notice when the schema matches the live version", () => {
    renderPanel();

    expect(screen.queryByText(/isn't published yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unpublished changes/)).not.toBeInTheDocument();
  });
});

describe("SchemaPreviewDrawer protocol switch", () => {
  const env = window as unknown as { __BLOCKS_ENV__: Record<string, string> };

  beforeEach(() => {
    env.__BLOCKS_ENV__.BLOCKS_GRAPHQL_PUBLIC_URL = PUBLIC_URL;
  });
  afterEach(() => {
    delete env.__BLOCKS_ENV__.BLOCKS_GRAPHQL_PUBLIC_URL;
  });

  function renderDrawer(props: Partial<Parameters<typeof SchemaPreviewDrawer>[0]> = {}) {
    const all = {
      previewData: { SchemaName: "RT_Blocklist" },
      schemaName: "RT_Blocklist",
      schemaType: 1,
      open: true,
      rawIntrospection: { __schema: {} },
      schemaDetails: schema,
      allSchemas: [schema],
      liveState: null,
      ...props,
    } as Parameters<typeof SchemaPreviewDrawer>[0];
    const view = render(<SchemaPreviewDrawer {...all} />);
    return {
      ...view,
      reopen: () => {
        view.rerender(<SchemaPreviewDrawer {...all} open={false} />);
        view.rerender(<SchemaPreviewDrawer {...all} open />);
      },
    };
  }

  const segment = (name: RegExp) => screen.getByRole("radio", { name });

  it("selects REST by default and shows the REST connection bar and cards", () => {
    renderDrawer();

    expect(segment(/REST/)).toHaveAttribute("aria-checked", "true");
    expect(segment(/GraphQL/)).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(`${BASE}/RT_Blocklist`)).toBeInTheDocument();
    expect(screen.getByText("Content-Type: application/json")).toBeInTheDocument();
    expect(cards()).toHaveLength(3);
  });

  it("passes the live state through to the REST notice", () => {
    renderDrawer({ liveState: "unpublished" });

    expect(screen.getByText(/This schema has unpublished changes/)).toBeInTheDocument();
  });

  it("shows no deprecated tag while GraphQL is not deprecated", () => {
    renderDrawer();

    expect(screen.queryByText("deprecated")).not.toBeInTheDocument();
  });

  it("tags the GraphQL segment deprecated when the flag is set", () => {
    deprecated.value = true;
    renderDrawer();

    expect(within(segment(/GraphQL/)).getByText("deprecated")).toBeInTheDocument();
    expect(within(segment(/REST/)).queryByText("deprecated")).not.toBeInTheDocument();
  });

  it("switches to today's GraphQL cards and connection rows", async () => {
    const user = userEvent.setup();
    sectionsMock = [{ title: "Query", description: "Fetch data", code: "query { getRT_Blocklists }" }];
    renderDrawer();

    await user.click(segment(/GraphQL/));

    expect(screen.getByText("Fetch data")).toBeInTheDocument();
    expect(screen.getByText(PUBLIC_URL)).toBeInTheDocument();
    expect(screen.getByText("x-blocks-key: t1")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText("Content-Type: application/json")).not.toBeInTheDocument();
  });

  it("keeps the selected operation group across protocol switches", async () => {
    const user = userEvent.setup();
    sectionsMock = [
      { title: "Query", description: "Fetch data", code: "query" },
      { title: "Update", description: "Change entry", code: "mutation" },
    ];
    renderDrawer();

    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(card("Upsert")).toBeInTheDocument();

    await user.click(segment(/GraphQL/));
    expect(screen.getByText("Change entry")).toBeInTheDocument();
    expect(screen.queryByText("Fetch data")).not.toBeInTheDocument();

    await user.click(segment(/REST/));
    expect(card("Upsert")).toBeInTheDocument();
  });

  it("selects REST again each time the drawer opens", async () => {
    const user = userEvent.setup();
    const { reopen } = renderDrawer();

    await user.click(segment(/GraphQL/));
    expect(segment(/GraphQL/)).toHaveAttribute("aria-checked", "true");

    reopen();
    expect(segment(/REST/)).toHaveAttribute("aria-checked", "true");
  });

  it("shows the empty state on the REST side without schema details", () => {
    renderDrawer({ schemaDetails: undefined });

    expect(segment(/REST/)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("No examples available")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("hands a GraphQL card to the playground as a graphql handoff", async () => {
    const user = userEvent.setup();
    sectionsMock = [{ title: "Query", description: "Fetch data", code: "QUERY_CODE" }];
    renderDrawer();

    await user.click(segment(/GraphQL/));
    await user.click(screen.getByRole("button", { name: /Playground/ }));

    expect(writePlaygroundHandoff).toHaveBeenCalledWith({ protocol: "graphql", query: "QUERY_CODE" });
    expect(navigate).toHaveBeenCalledWith("/data-gateway/playground");
  });
});
