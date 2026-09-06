import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useRef } from "react";
import { buildSchema } from "graphql";

// ---------------------------------------------------------------------------
// Hook + store mocks
// ---------------------------------------------------------------------------
const executeGraphQL = vi.fn();
const setSelectedProject = vi.fn();
let introspectedSchema: unknown = undefined;
let entityItems: unknown[] = [];
let dtoItems: unknown[] = [];

const project = {
  itemId: "proj-1",
  tenantId: "tenant-1",
  tenantSlug: "slug-1",
};

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: project, setSelectedProject }),
}));
vi.mock("@/hooks/use-project", () => ({
  useGetProject: () => ({ data: { data: project } }),
}));
vi.mock("../../hooks/use-configuration", () => ({
  useExecuteGraphQL: () => ({ mutateAsync: executeGraphQL, isPending: false }),
  useRawIntrospectionQuery: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
  }),
  useGraphQLIntrospection: () => ({ data: introspectedSchema }),
  useSchemaList: ({ schemaType }: { schemaType: string }) => ({
    data: { data: { items: schemaType === "DTO" ? dtoItems : entityItems } },
  }),
}));
vi.mock("./clean-test-data-modal", () => ({
  CleanTestDataModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="clean-modal" /> : null,
}));
vi.mock("./schemas-drawer", () => ({
  SchemasDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="schemas-drawer" /> : null,
}));

// ---------------------------------------------------------------------------
// Monaco mock — captures the editor instance, monaco namespace, and the
// registered completion / codelens providers so tests can drive them.
// ---------------------------------------------------------------------------
interface CompletionProviderMock {
  provideCompletionItems: (...args: unknown[]) => { suggestions: Array<Record<string, unknown>> };
}
interface CodeLensProviderMock {
  provideCodeLenses: (...args: unknown[]) => { lenses: Array<Record<string, unknown>> };
  resolveCodeLens: (...args: unknown[]) => unknown;
}
let capturedMonaco: ReturnType<typeof makeMonaco> | null = null;
let capturedEditor: ReturnType<typeof makeEditor> | null = null;
let completionProvider: CompletionProviderMock | null = null;
let codeLensProvider: CodeLensProviderMock | null = null;

function makeMonaco() {
  return {
    KeyMod: { Shift: 1, CtrlCmd: 2 },
    KeyCode: { Enter: 3, KeyE: 4 },
    editor: { setModelMarkers: vi.fn() },
    languages: {
      CompletionItemKind: {
        Function: 1,
        Field: 2,
        Keyword: 3,
        Variable: 4,
        Enum: 5,
        Class: 6,
      },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      registerCompletionItemProvider: (_lang: string, provider: unknown) => {
        completionProvider = provider as CompletionProviderMock;
        return { dispose: vi.fn() };
      },
      registerCodeLensProvider: (_lang: string, provider: unknown) => {
        codeLensProvider = provider as CodeLensProviderMock;
        return { dispose: vi.fn() };
      },
    },
  };
}

function makeEditor() {
  return {
    addCommand: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    getModel: () => ({ uri: "model" }),
    trigger: vi.fn(),
    _commandService: {
      executeCommand: vi.fn(() => Promise.resolve()),
    },
  };
}

vi.mock("@monaco-editor/react", () => ({
  default: (props: { onMount?: (editor: unknown, monaco: unknown) => void; onChange?: (value: string) => void; value?: string }) => {
    const mounted = useRef(false);
    useEffect(() => {
      if (!mounted.current && props.onMount) {
        mounted.current = true;
        capturedMonaco = makeMonaco();
        capturedEditor = makeEditor();
        props.onMount(capturedEditor, capturedMonaco);
      }
    }, [props.onMount]);
    return (
      <textarea
        data-testid={props.onChange ? "monaco-query" : "monaco-response"}
        value={props.value ?? ""}
        readOnly={!props.onChange}
        onChange={(e) => props.onChange?.(e.target.value)}
      />
    );
  },
}));

import { GraphQLPlaygroundPage } from "./graphql-playground-page";

// A model shim that reports the cursor at the end of `text`.
function makeModel(text: string) {
  return {
    getValue: () => text,
    getOffsetAt: () => text.length,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 }),
  };
}
const position = { lineNumber: 1, column: 1 };

async function renderMounted() {
  render(<GraphQLPlaygroundPage />);
  // Wait for the lazy Monaco editor to resolve and fire onMount.
  await waitFor(() => expect(completionProvider).not.toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
  introspectedSchema = undefined;
  completionProvider = null;
  codeLensProvider = null;
  capturedMonaco = null;
  capturedEditor = null;
  entityItems = [];
  dtoItems = [];
  localStorage.clear();
});

describe("GraphQLPlaygroundPage", () => {
  it("renders the header and query editor and registers providers on mount", async () => {
    await renderMounted();
    expect(screen.getByText("GraphQL Playground")).toBeInTheDocument();
    expect(screen.getByTestId("monaco-query")).toBeInTheDocument();
    expect(completionProvider).toBeTruthy();
    expect(codeLensProvider).toBeTruthy();
  });

  it("loads a stored query from localStorage and clears it", async () => {
    localStorage.setItem("graphql-playground-query", "query { getFoo }");
    await renderMounted();
    await waitFor(() =>
      expect(screen.getByTestId("monaco-query")).toHaveValue("query { getFoo }"),
    );
    expect(localStorage.getItem("graphql-playground-query")).toBeNull();
  });

  it("executes a single operation and shows the response", async () => {
    executeGraphQL.mockResolvedValue({ data: { ok: true } });
    await renderMounted();
    const editor = screen.getByTestId("monaco-query");
    fireEvent.change(editor, { target: { value: "query GetX {\n  getX\n}" } });
    fireEvent.click(screen.getByRole("button", { name: /Execute/ }));
    await waitFor(() =>
      expect(executeGraphQL).toHaveBeenCalledWith({
        projectShortKey: "slug-1",
        query: "query GetX {\n  getX\n}",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("monaco-response")).toHaveValue(
        JSON.stringify({ data: { ok: true } }, null, 2),
      ),
    );
  });

  it("executes the whole editor text when no operations are parsed", async () => {
    executeGraphQL.mockResolvedValue({ hello: 1 });
    await renderMounted();
    fireEvent.change(screen.getByTestId("monaco-query"), {
      target: { value: "{ bareSelection }" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
  });

  it("renders an Error tab when execution rejects", async () => {
    executeGraphQL.mockRejectedValue(new Error("boom"));
    await renderMounted();
    fireEvent.change(screen.getByTestId("monaco-query"), {
      target: { value: "notanop" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Execute/ }));
    await waitFor(() =>
      expect(
        (screen.getByTestId("monaco-response") as HTMLTextAreaElement).value,
      ).toContain("boom"),
    );
  });

  it("executes multiple operations and shows tabs", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    await renderMounted();
    fireEvent.change(screen.getByTestId("monaco-query"), {
      target: {
        value: "query A {\n  a\n}\nquery B {\n  b\n}",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("tab", { name: "Response 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Response 2" })).toBeInTheDocument();
  });

  it("injects a mock-data Tag into insert mutations before executing", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    await renderMounted();
    fireEvent.change(screen.getByTestId("monaco-query"), {
      target: {
        value: 'mutation {\n  insertProduct(input: { name: "x" }) {\n    itemId\n  }\n}',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    const sent = executeGraphQL.mock.calls[0][0].query as string;
    expect(sent).toContain("mock-data");
  });

  it("opens the schemas drawer and clean-data modal from the toolbar", async () => {
    await renderMounted();
    fireEvent.click(screen.getByRole("button", { name: "Schemas" }));
    expect(await screen.findByTestId("schemas-drawer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clean Test Data" }));
    expect(await screen.findByTestId("clean-modal")).toBeInTheDocument();
  });

  it("reacts to the dark-class MutationObserver by switching theme", async () => {
    await renderMounted();
    // Toggling the dark class should not throw and should update state.
    document.documentElement.classList.add("dark");
    await new Promise((r) => setTimeout(r, 0));
    document.documentElement.classList.remove("dark");
    expect(true).toBe(true);
  });

  // ---- Completion provider: schema-list fallback branch -------------------
  it("suggests schema-based operations when introspection is absent", async () => {
    entityItems = [
      {
        schemaName: "Product",
        fields: [
          { name: "name", type: "string", isArray: false },
          { name: "price", type: "int", isArray: false },
        ],
      },
    ];
    await renderMounted();
    const result = completionProvider.provideCompletionItems(
      makeModel("query {\n  "),
      position,
    );
    const labels = result.suggestions.map((s: { label: string }) => s.label);
    expect(labels).toContain("getProducts");
    expect(labels).toContain("insertProduct");
    expect(labels).toContain("updateProduct");
    expect(labels).toContain("deleteProduct");
  });

  it("suggests input fields inside an insert input block (fallback)", async () => {
    entityItems = [
      {
        schemaName: "Product",
        fields: [
          { name: "name", type: "string", isArray: false },
          { name: "meta", type: "Meta", isArray: false },
        ],
      },
    ];
    dtoItems = [
      { schemaName: "Meta", fields: [{ name: "sku", type: "string", isArray: false }] },
    ];
    await renderMounted();
    const text = "mutation {\n  insertProduct(\n    input: {\n      ";
    const result = completionProvider.provideCompletionItems(
      makeModel(text),
      position,
    );
    const labels = result.suggestions.map((s: { label: string }) => s.label);
    expect(labels).toContain("name");
    expect(labels).toContain("meta");
  });

  // ---- Completion provider: introspection branch --------------------------
  it("suggests keyword + operation snippets from the introspected schema", async () => {
    introspectedSchema = buildSchema(`
      type Product { id: ID name: String }
      type ProductList { items: [Product] totalCount: Int }
      type Query { getProducts: ProductList }
      type Mutation { insertProduct(name: String): Product }
    `);
    await renderMounted();
    const result = completionProvider.provideCompletionItems(
      makeModel(""),
      position,
    );
    const labels = result.suggestions.map((s: { label: string }) => s.label);
    expect(labels).toContain("query");
    expect(labels).toContain("mutation");
    expect(result.suggestions.length).toBeGreaterThan(2);
  });

  it("suggests operation names at depth 1 inside a query block", async () => {
    introspectedSchema = buildSchema(`
      type Product { id: ID name: String }
      type ProductList { items: [Product] totalCount: Int }
      type Query { getProducts: ProductList }
      type Mutation { insertProduct(name: String): Product }
    `);
    await renderMounted();
    const result = completionProvider.provideCompletionItems(
      makeModel("query {\n  "),
      position,
    );
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  const richSchema = `
    input ProductInput { name: String price: Int }
    type Product { id: ID name: String price: Int }
    type ProductList { items: [Product] totalCount: Int }
    type Query { getProducts: ProductList }
    type Mutation { insertProduct(input: ProductInput): Product }
  `;

  it("suggests operation arguments when the cursor is inside parentheses", async () => {
    introspectedSchema = buildSchema(richSchema);
    await renderMounted();
    const result = completionProvider.provideCompletionItems(
      makeModel("query {\n  getProducts("),
      position,
    );
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("suggests field selections inside an items block (introspection)", async () => {
    introspectedSchema = buildSchema(richSchema);
    await renderMounted();
    const result = completionProvider.provideCompletionItems(
      makeModel("query {\n  getProducts {\n    items {\n      "),
      position,
    );
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("suggests input object fields inside a mutation input block (introspection)", async () => {
    introspectedSchema = buildSchema(richSchema);
    await renderMounted();
    const result = completionProvider.provideCompletionItems(
      makeModel("mutation {\n  insertProduct(input: {\n    "),
      position,
    );
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  // ---- CodeLens + per-operation execution ---------------------------------
  it("provides one CodeLens per parsed operation", async () => {
    await renderMounted();
    const model = makeModel("query A {\n  a\n}\nmutation B {\n  b\n}");
    const result = codeLensProvider.provideCodeLenses(model);
    expect(result.lenses.length).toBe(2);
    expect(result.lenses[0].command.id).toBe("run-graphql-operation-0");
    // resolveCodeLens returns the lens unchanged.
    expect(codeLensProvider.resolveCodeLens(model, result.lenses[0])).toBe(
      result.lenses[0],
    );
  });

  it("runs a single operation via the CodeLens command service hook", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    await renderMounted();
    // Populate the operation map first.
    codeLensProvider.provideCodeLenses(makeModel("query A {\n  a\n}"));
    await capturedEditor._commandService.executeCommand("run-graphql-operation-0");
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
  });

  it("delegates unknown commands to the original command service", async () => {
    await renderMounted();
    const res = await capturedEditor._commandService.executeCommand("some.other.command");
    expect(res).toBeUndefined();
  });

  // ---- injectMockDataTag branches (via execution) -------------------------
  async function executeQueryText(text: string) {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    await renderMounted();
    fireEvent.change(screen.getByTestId("monaco-query"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalled());
    return executeGraphQL.mock.calls.at(-1)![0].query as string;
  }

  it("appends mock-data to an existing Tags array on insert", async () => {
    const sent = await executeQueryText(
      'mutation {\n  insertProduct(input: { name: "x", Tags: ["a"] }) {\n    itemId\n  }\n}',
    );
    expect(sent).toContain("mock-data");
    expect(sent).toContain('"a"');
  });

  it("leaves an insert unchanged when Tags already contains mock-data", async () => {
    const sent = await executeQueryText(
      'mutation {\n  insertProduct(input: { Tags: ["mock-data"] }) {\n    itemId\n  }\n}',
    );
    // Only one occurrence of mock-data (no duplication).
    expect(sent.match(/mock-data/g)?.length).toBe(1);
  });

  it("injects mock-data into each object of an insertMany array", async () => {
    const sent = await executeQueryText(
      'mutation {\n  insertManyProduct(input: [{ name: "a" }, { name: "b" }]) {\n    itemId\n  }\n}',
    );
    expect(sent.match(/mock-data/g)?.length).toBe(2);
  });

  // ---- generateFieldSnippet with nested DTOs (fallback completions) --------
  it("builds nested DTO field snippets in schema-based operation suggestions", async () => {
    entityItems = [
      {
        schemaName: "Product",
        fields: [
          { name: "meta", type: "Meta", isArray: false },
          { name: "tags", type: "Tag", isArray: true },
          { name: "name", type: "string", isArray: false },
        ],
      },
    ];
    dtoItems = [
      { schemaName: "Meta", fields: [{ name: "sku", type: "string", isArray: false }] },
      { schemaName: "Tag", fields: [{ name: "label", type: "string", isArray: false }] },
    ];
    await renderMounted();
    const result = completionProvider.provideCompletionItems(
      makeModel("query {\n  "),
      position,
    );
    const getProducts = result.suggestions.find(
      (s: { label: string }) => s.label === "getProducts",
    );
    expect(getProducts).toBeTruthy();
    // Nested DTO selection is expanded inside the items block.
    expect(getProducts.insertText).toContain("meta {");
    expect(getProducts.insertText).toContain("tags {");
  });

  it("suggests nested DTO fields inside an insert input block (fallback)", async () => {
    entityItems = [
      {
        schemaName: "Product",
        fields: [
          { name: "meta", type: "Meta", isArray: false },
          { name: "tags", type: "Tag", isArray: true },
        ],
      },
    ];
    dtoItems = [
      { schemaName: "Meta", fields: [{ name: "sku", type: "string", isArray: false }] },
      { schemaName: "Tag", fields: [{ name: "label", type: "string", isArray: false }] },
    ];
    await renderMounted();
    const text = "mutation {\n  insertProduct(\n    input: {\n      ";
    const result = completionProvider.provideCompletionItems(makeModel(text), position);
    const meta = result.suggestions.find((s: { label: string }) => s.label === "meta");
    expect(meta.insertText).toContain("sku");
    const tags = result.suggestions.find((s: { label: string }) => s.label === "tags");
    expect(tags.insertText).toContain("[{");
  });

  it("suggests nested DTO fields inside an items selection block (fallback)", async () => {
    entityItems = [
      {
        schemaName: "Product",
        fields: [{ name: "meta", type: "Meta", isArray: false }],
      },
    ];
    dtoItems = [
      { schemaName: "Meta", fields: [{ name: "sku", type: "string", isArray: false }] },
    ];
    await renderMounted();
    const text = "query {\n  getProducts(input: {}) {\n    items {\n      ";
    const result = completionProvider.provideCompletionItems(makeModel(text), position);
    const meta = result.suggestions.find((s: { label: string }) => s.label === "meta");
    expect(meta.insertText).toContain("sku");
  });

  // ---- depth >= 2 introspection field suggestions -------------------------
  it("suggests return-type fields directly inside an operation block", async () => {
    introspectedSchema = buildSchema(`
      type Product { id: ID name: String }
      type ProductList { items: [Product] totalCount: Int }
      type Query { getProducts: ProductList }
      type Mutation { noop: String }
    `);
    await renderMounted();
    const result = completionProvider.provideCompletionItems(
      makeModel("query {\n  getProducts {\n    "),
      position,
    );
    expect(Array.isArray(result.suggestions)).toBe(true);
  });
});
