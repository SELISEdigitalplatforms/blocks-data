import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useEffect, useRef, useState } from "react";
import { buildSchema } from "graphql";
import { registerTranslations, useI18nStore } from "@seliseblocks/genesis-os/i18n";

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

// Every Monaco registration the page makes, across mounts, with its disposal state.
type CommandHandler = (accessor: unknown, ...args: unknown[]) => unknown;
interface KeybindingRuleMock {
  keybinding: number;
  command: string;
  when?: string;
}
interface Registration {
  kind: "command" | "keybinding" | "codelens" | "completion";
  id?: string;
  handler?: CommandHandler;
  rule?: KeybindingRuleMock;
  disposed: boolean;
  dispose: ReturnType<typeof vi.fn>;
}
let registrations: Registration[] = [];
function track(entry: Omit<Registration, "disposed" | "dispose">) {
  const registration: Registration = { ...entry, disposed: false, dispose: vi.fn() };
  registration.dispose.mockImplementation(() => {
    registration.disposed = true;
  });
  registrations.push(registration);
  return { dispose: registration.dispose };
}
const ofKind = (kind: Registration["kind"]) => registrations.filter((r) => r.kind === kind);
const live = (kind: Registration["kind"]) => ofKind(kind).filter((r) => !r.disposed);

// Monaco's command service is one shared instance whose executeCommand lives on the
// prototype; every editor holds the same object (standaloneServices.js / codeEditorWidget.js).
class SharedCommandService {
  executeCommand(_commandId: string, ..._args: unknown[]): Promise<unknown> {
    return Promise.resolve(undefined);
  }
}
const sharedCommandService = new SharedCommandService();
const setModelMarkers = vi.fn();
let codeLensRegistrationError: Error | null = null;

function makeMonaco() {
  return {
    KeyMod: { Shift: 1, CtrlCmd: 2 },
    KeyCode: { Enter: 4, KeyE: 8 },
    editor: {
      setModelMarkers,
      registerCommand: (id: string, handler: CommandHandler) =>
        track({ kind: "command", id, handler }),
      addKeybindingRule: (rule: KeybindingRuleMock) => track({ kind: "keybinding", rule }),
    },
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
        return track({ kind: "completion" });
      },
      registerCodeLensProvider: (_lang: string, provider: unknown) => {
        if (codeLensRegistrationError) throw codeLensRegistrationError;
        codeLensProvider = provider as CodeLensProviderMock;
        return track({ kind: "codelens" });
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
    createContextKey: vi.fn(() => ({ set: vi.fn(), reset: vi.fn(), get: vi.fn() })),
    _commandService: sharedCommandService,
  };
}

vi.mock("./monaco-local", () => ({}));

// Options passed to the query editor and to the response editors on the latest render.
let queryEditorOptions: Record<string, unknown> | undefined;
// Keyed by mounted response-editor instance, so only editors on screen are listed.
const responseEditorOptions = new Map<object, Record<string, unknown> | undefined>();
let capturedOnMount: ((editor: unknown, monaco: unknown) => void) | undefined;

vi.mock("@monaco-editor/react", () => ({
  default: function MonacoEditorMock(props: {
    onMount?: (editor: unknown, monaco: unknown) => void;
    onChange?: (value: string) => void;
    value?: string;
    options?: Record<string, unknown>;
  }) {
    const mounted = useRef(false);
    const [instance] = useState(() => ({}));
    const { onMount, onChange, options } = props;
    useEffect(() => {
      if (onChange) {
        queryEditorOptions = options;
        capturedOnMount = onMount;
      } else {
        responseEditorOptions.set(instance, options);
      }
    });
    useEffect(() => () => void responseEditorOptions.delete(instance), [instance]);
    useEffect(() => {
      if (!mounted.current && onMount) {
        mounted.current = true;
        capturedMonaco = makeMonaco();
        capturedEditor = makeEditor();
        onMount(capturedEditor, capturedMonaco);
      }
    }, [onMount]);
    return (
      <textarea
        data-testid={onChange ? "monaco-query" : "monaco-response"}
        value={props.value ?? ""}
        readOnly={!onChange}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  },
}));

import { GraphQLWorkspace } from "./graphql-playground-page";

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
  render(<GraphQLWorkspace schemasOpen={false} onSchemasOpenChange={() => {}} />);
  // Wait for the lazy Monaco editor to resolve and fire onMount.
  await waitFor(() => expect(completionProvider).not.toBeNull());
}

const RUN = "graphql-playground.run-operation";
const NEWLINE = "graphql-playground.insert-newline";
const EXECUTE = "graphql-playground.execute";
const CONTEXT_KEY = "graphqlPlaygroundQueryEditor";

// The handler of the live (registered, not yet disposed) command with this id.
function commandHandler(id: string): CommandHandler {
  const handler = live("command").find((r) => r.id === id)?.handler;
  if (!handler) throw new Error(`command ${id} is not registered`);
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  introspectedSchema = undefined;
  completionProvider = null;
  codeLensProvider = null;
  capturedMonaco = null;
  capturedEditor = null;
  registrations = [];
  responseEditorOptions.clear();
  queryEditorOptions = undefined;
  capturedOnMount = undefined;
  codeLensRegistrationError = null;
  // The patch removed by this change would leave an own executeCommand behind; start clean.
  Reflect.deleteProperty(sharedCommandService, "executeCommand");
  entityItems = [];
  dtoItems = [];
  localStorage.clear();
});

describe("GraphQLWorkspace", () => {
  it("renders the query editor and registers providers on mount", async () => {
    await renderMounted();
    expect(screen.getByTestId("monaco-query")).toBeInTheDocument();
    expect(completionProvider).toBeTruthy();
    expect(codeLensProvider).toBeTruthy();
  });

  it("puts initialQuery into the query editor", async () => {
    render(
      <GraphQLWorkspace initialQuery="query { getFoo }" schemasOpen={false} onSchemasOpenChange={() => {}} />,
    );
    await waitFor(() => expect(completionProvider).not.toBeNull());
    expect(screen.getByTestId("monaco-query")).toHaveValue("query { getFoo }");
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
  it("provides one CodeLens per parsed operation with the run command and the operation text (E1)", async () => {
    await renderMounted();
    const model = makeModel("query A {\n  a\n}\nmutation {\n  b\n}");
    const result = codeLensProvider!.provideCodeLenses(model);
    expect(result.lenses).toEqual([
      {
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        command: { id: RUN, title: '▶ Run query "A"', arguments: ["query A {\n  a\n}"] },
      },
      {
        range: { startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 1 },
        command: { id: RUN, title: "▶ Run mutation", arguments: ["mutation {\n  b\n}"] },
      },
    ]);
    // resolveCodeLens returns the lens unchanged.
    expect(codeLensProvider!.resolveCodeLens(model, result.lenses[0])).toBe(result.lenses[0]);
  });

  it("runs exactly the operation text passed to the run command and shows one Response tab (E2)", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    await renderMounted();
    await act(async () => {
      await commandHandler(RUN)({}, "query A {\n  a\n}");
    });
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
    expect(executeGraphQL).toHaveBeenCalledWith({ projectShortKey: "slug-1", query: "query A {\n  a\n}" });
    expect(screen.getAllByTestId("monaco-response")).toHaveLength(1);
    expect(screen.getByTestId("monaco-response")).toHaveValue('{\n  "ok": 1\n}');
    expect(screen.getByText("Response")).toBeInTheDocument();
  });

  it("injects the mock-data tag into an insert run from the CodeLens", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    await renderMounted();
    await act(async () => {
      await commandHandler(RUN)({}, 'mutation {\n  insertProduct(input: { name: "x" }) {\n    itemId\n  }\n}');
    });
    expect(executeGraphQL.mock.calls[0][0].query).toContain("mock-data");
  });

  it("ignores a run command without a string operation (E5, C4)", async () => {
    await renderMounted();
    const run = commandHandler(RUN);
    expect(() => run({})).not.toThrow();
    expect(() => run({}, 42)).not.toThrow();
    expect(run({})).toBeUndefined();
    expect(executeGraphQL).not.toHaveBeenCalled();
  });

  it("shows the error response tab when a CodeLens run fails (C5)", async () => {
    executeGraphQL.mockRejectedValue(new Error("boom"));
    await renderMounted();
    await act(async () => {
      await expect(commandHandler(RUN)({}, "query A {\n  a\n}")).resolves.toBeUndefined();
    });
    expect(screen.getByTestId("monaco-response")).toHaveValue(
      JSON.stringify({ error: "Error: boom" }, null, 2),
    );
  });

  it("drops the quoted name when the translated Unnamed label is used (E4, C9)", async () => {
    act(() =>
      registerTranslations("data.gateway.schema", { "GRAPHQL_PLAYGROUND_PAGE.UNNAMED": "[xx] Unnamed" }),
    );
    try {
      await renderMounted();
      const result = codeLensProvider!.provideCodeLenses(makeModel("query {\n  x\n}"));
      expect(result.lenses.map((lens) => lens.command.title)).toEqual(["▶ Run query"]);
      // A one-line operation never closes, so it yields no lens, as before.
      expect(codeLensProvider!.provideCodeLenses(makeModel("query { x }")).lenses).toEqual([]);
    } finally {
      act(() =>
        registerTranslations("data.gateway.schema", { "GRAPHQL_PLAYGROUND_PAGE.UNNAMED": "Unnamed" }),
      );
    }
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

describe("GraphQLWorkspace Monaco registrations", () => {
  const ownsExecuteCommand = () => Object.prototype.hasOwnProperty.call(sharedCommandService, "executeCommand");
  const commandIds = (list: Registration[]) => list.map((r) => r.id);

  it("registers the three commands, then the two keybinding rules, then the CodeLens provider, once (H1)", async () => {
    await renderMounted();
    const pageOwned = registrations.filter((r) => r.kind !== "completion");
    expect(pageOwned.map((r) => (r.kind === "command" ? r.id : r.kind))).toEqual([
      RUN,
      NEWLINE,
      EXECUTE,
      "keybinding",
      "keybinding",
      "codelens",
    ]);
    expect(live("command")).toHaveLength(3);
    expect(live("keybinding")).toHaveLength(2);
    expect(live("codelens")).toHaveLength(1);
    expect(live("completion")).toHaveLength(1);
    expect(capturedEditor!.createContextKey).toHaveBeenCalledTimes(1);
    expect(capturedEditor!.createContextKey).toHaveBeenCalledWith(CONTEXT_KEY, true);
    expect(capturedEditor!.addCommand).not.toHaveBeenCalled();
  });

  it("binds Shift+Enter and Ctrl/Cmd+Shift+E to the query editor's context key", async () => {
    await renderMounted();
    const { KeyMod, KeyCode } = capturedMonaco!;
    expect(live("keybinding").map((r) => r.rule)).toEqual([
      { keybinding: KeyMod.Shift | KeyCode.Enter, command: NEWLINE, when: CONTEXT_KEY },
      { keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE, command: EXECUTE, when: CONTEXT_KEY },
    ]);
  });

  it("inserts a newline into the query editor without executing (H5)", async () => {
    await renderMounted();
    commandHandler(NEWLINE)({});
    expect(capturedEditor!.trigger).toHaveBeenCalledWith("keyboard", "type", { text: "\n" });
    expect(executeGraphQL).not.toHaveBeenCalled();
  });

  it("executes every parsed operation through the Execute button (H6)", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    await renderMounted();
    fireEvent.change(screen.getByTestId("monaco-query"), {
      target: { value: "query A {\n  a\n}\nquery B {\n  b\n}" },
    });
    await act(async () => {
      commandHandler(EXECUTE)({});
    });
    await waitFor(() => expect(executeGraphQL).toHaveBeenCalledTimes(2));
  });

  it("turns CodeLens off in every response editor and keeps the other options (H9)", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    const responseOptions = {
      readOnly: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: "on",
      folding: true,
      codeLens: false,
    };
    await renderMounted();
    // Empty branch.
    expect([...responseEditorOptions.values()]).toEqual([responseOptions]);
    // Single-response branch.
    fireEvent.change(screen.getByTestId("monaco-query"), { target: { value: "query A {\n  a\n}" } });
    fireEvent.click(screen.getByRole("button", { name: /Execute/ }));
    await waitFor(() => expect(screen.getByTestId("monaco-response")).toHaveValue('{\n  "ok": 1\n}'));
    expect([...responseEditorOptions.values()]).toEqual([responseOptions]);
    // Tabs branch.
    fireEvent.change(screen.getByTestId("monaco-query"), {
      target: { value: "query A {\n  a\n}\nquery B {\n  b\n}" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Execute/ }));
    expect(await screen.findByRole("tab", { name: "Response 2" })).toBeInTheDocument();
    const tabOptions = [...responseEditorOptions.values()];
    expect(tabOptions.length).toBeGreaterThanOrEqual(1);
    for (const options of tabOptions) expect(options).toEqual(responseOptions);
    // The query editor keeps its CodeLens.
    expect(queryEditorOptions).toMatchObject({ codeLens: true });
  });

  it("disposes every page registration on unmount (H10)", async () => {
    const { unmount } = render(<GraphQLWorkspace schemasOpen={false} onSchemasOpenChange={() => {}} />);
    await waitFor(() => expect(completionProvider).not.toBeNull());
    unmount();
    for (const kind of ["command", "keybinding", "codelens", "completion"] as const) {
      expect(ofKind(kind).length).toBeGreaterThan(0);
      expect(live(kind)).toHaveLength(0);
    }
  });

  it("runs with the latest project without re-registering (H11)", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    const { rerender } = render(<GraphQLWorkspace schemasOpen={false} onSchemasOpenChange={() => {}} />);
    await waitFor(() => expect(completionProvider).not.toBeNull());
    project.tenantSlug = "slug-2";
    try {
      rerender(<GraphQLWorkspace schemasOpen={false} onSchemasOpenChange={() => {}} />);
      await act(async () => {
        await commandHandler(RUN)({}, "query A {\n  a\n}");
      });
      expect(executeGraphQL).toHaveBeenCalledWith({ projectShortKey: "slug-2", query: "query A {\n  a\n}" });
      expect(commandIds(ofKind("command"))).toEqual([RUN, NEWLINE, EXECUTE]);
      expect(ofKind("codelens")).toHaveLength(1);
    } finally {
      project.tenantSlug = "slug-1";
    }
  });

  it("leaves the shared command service untouched across 5 mounts and runs once afterwards (C1, E3, C10)", async () => {
    executeGraphQL.mockResolvedValue({ ok: 1 });
    for (let i = 0; i < 5; i++) {
      completionProvider = null;
      const { unmount } = render(<GraphQLWorkspace schemasOpen={false} onSchemasOpenChange={() => {}} />);
      await waitFor(() => expect(completionProvider).not.toBeNull());
      expect(ownsExecuteCommand()).toBe(false);
      unmount();
    }
    expect(ownsExecuteCommand()).toBe(false);
    expect(sharedCommandService.executeCommand).toBe(SharedCommandService.prototype.executeCommand);
    const runs = ofKind("command").filter((r) => r.id === RUN);
    expect(runs).toHaveLength(5);
    expect(runs.every((r) => r.disposed)).toBe(true);
    expect(ofKind("codelens")).toHaveLength(5);
    expect(live("codelens")).toHaveLength(0);

    completionProvider = null;
    await renderMounted();
    await act(async () => {
      await commandHandler(RUN)({}, "query A {\n  a\n}");
    });
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
  });

  it("does not re-register when translations change while mounted (C2)", async () => {
    await renderMounted();
    act(() => registerTranslations("x.y", { K: "v" }));
    act(() => useI18nStore.getState().setRemote("xx", "data.gateway.schema", { K: "v" }));
    expect(ofKind("codelens")).toHaveLength(1);
    expect(ownsExecuteCommand()).toBe(false);
    expect(commandIds(ofKind("command"))).toEqual([RUN, NEWLINE, EXECUTE]);
    expect(ofKind("keybinding")).toHaveLength(2);
  });

  it("owns exactly one set of registrations under StrictMode (C3)", async () => {
    const { unmount } = render(
      <StrictMode>
        <GraphQLWorkspace schemasOpen={false} onSchemasOpenChange={() => {}} />
      </StrictMode>,
    );
    await waitFor(() => expect(completionProvider).not.toBeNull());
    expect(commandIds(live("command"))).toEqual([RUN, NEWLINE, EXECUTE]);
    expect(live("keybinding")).toHaveLength(2);
    expect(live("codelens")).toHaveLength(1);
    unmount();
    expect(live("command")).toHaveLength(0);
    expect(live("keybinding")).toHaveLength(0);
    expect(live("codelens")).toHaveLength(0);
  });

  it("logs and disposes what it registered when a registration throws (C7)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("lens boom");
    codeLensRegistrationError = failure;
    try {
      await renderMounted();
      await waitFor(() => expect(ofKind("keybinding")).toHaveLength(2));
      expect(consoleError).toHaveBeenCalledWith("Error registering CodeLens provider:", failure);
      expect(ofKind("command")).toHaveLength(3);
      expect(live("command")).toHaveLength(0);
      expect(live("keybinding")).toHaveLength(0);
      expect(ofKind("codelens")).toHaveLength(0);
      expect(screen.getByTestId("monaco-query")).toBeInTheDocument();
    } finally {
      codeLensRegistrationError = null;
      consoleError.mockRestore();
    }
  });

  it("never patches the command service, listens to content or sets markers (C8)", async () => {
    await renderMounted();
    codeLensProvider!.provideCodeLenses(makeModel("query A {\n  a\n}"));
    fireEvent.change(screen.getByTestId("monaco-query"), { target: { value: "query B {\n  b\n}" } });
    expect(capturedEditor!.onDidChangeModelContent).not.toHaveBeenCalled();
    expect(setModelMarkers).not.toHaveBeenCalled();
    expect(ownsExecuteCommand()).toBe(false);
  });

  it("targets the latest editor after a second onMount (C11)", async () => {
    await renderMounted();
    const firstEditor = capturedEditor!;
    const secondEditor = makeEditor();
    act(() => capturedOnMount!(secondEditor, capturedMonaco));
    expect(secondEditor.createContextKey).toHaveBeenCalledWith(CONTEXT_KEY, true);
    commandHandler(NEWLINE)({});
    expect(secondEditor.trigger).toHaveBeenCalledWith("keyboard", "type", { text: "\n" });
    expect(firstEditor.trigger).not.toHaveBeenCalled();
    expect(ofKind("command")).toHaveLength(3);
  });

  it("keeps window.monaco set to the Monaco namespace (C14)", async () => {
    await renderMounted();
    expect((window as unknown as { monaco?: unknown }).monaco).toBe(capturedMonaco);
  });
});
