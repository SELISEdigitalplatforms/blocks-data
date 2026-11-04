import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IField, ISchemaDetails } from "../../models/data-service";
import { RestPathError, sendRestRequest, type RestResponse } from "../../rest/rest-client";
import { useSchemaList } from "../../hooks/use-configuration";
import {
  loadTemplate,
  requestToDraft,
  RestWorkspace,
  type RestDraft,
} from "./rest-workspace";

type Action = { id: string; label: string; keybindings: number[]; run: () => void };

const fake = vi.hoisted(() => {
  const json = {
    diagnosticsOptions: { schemas: [] as { uri: string; fileMatch?: string[]; schema?: unknown }[] },
    setDiagnosticsOptions: vi.fn(),
  };
  json.setDiagnosticsOptions.mockImplementation((options) => {
    json.diagnosticsOptions = options;
  });
  return {
    json,
    /** Every editor's `addCommand` calls and `addAction` descriptors, across mounts. */
    addCommand: vi.fn(),
    actions: [] as Action[],
    monaco: {
      KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512, WinCtrl: 256 },
      KeyCode: { Enter: 3 },
      languages: { json: { jsonDefaults: json } },
    },
  };
});

vi.mock("../playground/monaco-editor", async () => {
  const { useEffect, useRef } = await import("react");
  type Props = {
    value?: string;
    path?: string;
    options?: { readOnly?: boolean };
    onChange?: (value: string) => void;
    onMount?: (editor: unknown, monaco: unknown) => void;
  };
  function MockEditor({ value, path, options, onChange, onMount }: Props) {
    const actions = useRef<Action[]>([]);
    useEffect(() => {
      const editor = {
        addCommand: fake.addCommand,
        addAction: (action: Action) => {
          actions.current.push(action);
          fake.actions.push(action);
          return { dispose: () => {} };
        },
      };
      onMount?.(editor, fake.monaco);
      // Mount once, like Monaco.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (options?.readOnly) return <pre data-testid="response-body">{value}</pre>;
    return (
      <textarea
        aria-label="Body editor"
        data-path={path}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const mods =
            (event.ctrlKey ? fake.monaco.KeyMod.WinCtrl : 0) | (event.metaKey ? fake.monaco.KeyMod.CtrlCmd : 0);
          actions.current
            .filter((a) => a.keybindings.includes(mods | fake.monaco.KeyCode.Enter))
            .forEach((a) => a.run());
        }}
      />
    );
  }
  return { PlaygroundMonacoEditor: MockEditor, usePlaygroundMonacoTheme: () => "light" };
});

vi.mock("../../rest/rest-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../rest/rest-client")>();
  return {
    ...actual,
    sendRestRequest: vi.fn(),
    gatewayBaseUrl: () => "https://api.test/api/gateway",
  };
});

vi.mock("../../hooks/use-configuration", () => ({
  useSchemaList: vi.fn(),
  useSchemaDetails: vi.fn(),
}));

const field = (name: string, type: string, extra: Partial<IField> = {}) =>
  ({ name, type, isArray: false, ...extra }) as IField;
const schema = (schemaName: string, schemaType: number, fields: IField[]) =>
  ({ id: schemaName, schemaName, schemaType, fields }) as ISchemaDetails;

const ENTITIES = [
  schema("Employee", 1, [field("ItemId", "String"), field("Name", "String"), field("Address", "AddressDto")]),
  schema("Order", 1, [field("Total", "Float")]),
];
const DTOS = [schema("AddressDto", 2, [field("City", "String")])];

const send = vi.mocked(sendRestRequest);
const ok = (status = 200, bodyText = "{}"): RestResponse => ({
  kind: "response",
  status,
  statusText: "",
  headers: [],
  contentType: "application/json",
  bodyText,
  durationMs: 5,
  sizeBytes: bodyText.length,
});

/** The next send stays out until its signal aborts, then answers "aborted" (as sendRestRequest does). */
const pendingSend = () =>
  send.mockImplementationOnce(
    (_req, signal) =>
      new Promise<RestResponse>((done) => {
        signal?.addEventListener("abort", () => done({ kind: "aborted" }));
      }),
  );

let nonce = 0;
const renderWith = (draft: RestDraft) => {
  const view = render(<RestWorkspace incoming={{ draft, nonce: ++nonce }} />);
  return {
    ...view,
    load: (next: RestDraft) => view.rerender(<RestWorkspace incoming={{ draft: next, nonce: ++nonce }} />),
  };
};

const pathField = () => screen.getByRole("combobox", { name: "Request path" }) as HTMLInputElement;
const bodyField = () => screen.getByRole("textbox", { name: "Body editor" }) as HTMLTextAreaElement;
const clickSend = () => userEvent.click(screen.getByRole("button", { name: "Send" }));
type SchemaLike = { type?: string; properties: Record<string, SchemaLike>; items?: SchemaLike };
const lastSchema = () => {
  const calls = fake.json.setDiagnosticsOptions.mock.calls;
  return calls[calls.length - 1][0] as { schemas: { uri: string; fileMatch: string[]; schema: SchemaLike }[] };
};

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(ok());
  fake.json.setDiagnosticsOptions.mockClear();
  fake.addCommand.mockClear();
  fake.actions.length = 0;
  fake.json.diagnosticsOptions = { schemas: [] };
  vi.mocked(useSchemaList).mockImplementation(
    ({ schemaType }) =>
      ({ data: { data: { items: schemaType === 1 ? ENTITIES : DTOS } } }) as ReturnType<typeof useSchemaList>,
  );
});

afterEach(() => vi.clearAllMocks());

describe("RestWorkspace: sending", () => {
  it("sends method, path, query and body on Send", async () => {
    renderWith({ method: "POST", requestLine: "/Employee:query?trace=1", bodyText: '{"where":{}}' });
    await clickSend();
    expect(send).toHaveBeenCalledWith(
      { method: "POST", path: "/Employee:query", query: [["trace", "1"]], body: '{"where":{}}' },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText("200 OK")).toBeInTheDocument();
  });

  it("does not send a body for GET", async () => {
    renderWith({ method: "GET", requestLine: "/Employee", bodyText: '{"x":1}' });
    await clickSend();
    expect(send).toHaveBeenCalledWith({ method: "GET", path: "/Employee", query: [] }, expect.any(AbortSignal));
  });

  it("Ctrl+Enter sends from the path field, and Ctrl+Enter or Cmd+Enter from the body editor", async () => {
    renderWith({ method: "POST", requestLine: "/Employee", bodyText: "{}" });
    fireEvent.keyDown(pathField(), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(bodyField(), { key: "Enter", metaKey: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(bodyField(), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    fireEvent.keyDown(pathField(), { key: "Enter" });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("binds Send in the body editor as an editor-scoped action, never a global addCommand", () => {
    renderWith({ method: "POST", requestLine: "/Employee", bodyText: "{}" });
    expect(fake.addCommand).not.toHaveBeenCalled();
    const { KeyMod, KeyCode } = fake.monaco;
    expect(fake.actions).toEqual([
      {
        id: "rest-playground.send",
        label: "Send",
        keybindings: [KeyMod.CtrlCmd | KeyCode.Enter, KeyMod.WinCtrl | KeyCode.Enter],
        run: expect.any(Function),
      },
    ]);
  });

  it("GET hides the Body tab", () => {
    const { load } = renderWith({ method: "GET", requestLine: "/Employee", bodyText: "" });
    expect(screen.queryByRole("tab", { name: "Body" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Body editor" })).not.toBeInTheDocument();
    load({ method: "POST", requestLine: "/Employee", bodyText: "" });
    expect(screen.getByRole("tab", { name: "Body" })).toBeInTheDocument();
  });

  it('POST /E sends the body with Tags ["mock-data"] and shows the mock-data note', async () => {
    renderWith({ method: "POST", requestLine: "/Employee", bodyText: '{\n  "Name": "Ann"\n}' });
    expect(
      screen.getByText("Records created here are tagged mock-data so Clean test data can remove them."),
    ).toBeInTheDocument();
    await clickSend();
    const req = send.mock.calls[0][0];
    expect(JSON.parse(req.body!)).toEqual({ Name: "Ann", Tags: ["mock-data"] });
  });

  it("tagging keeps every number exactly as typed", async () => {
    renderWith({
      method: "POST",
      requestLine: "/Employee:insertMany",
      bodyText: '[{ "Id": 9007199254740993, "Price": 1.0, "Delta": -0, "Huge": 1e400, "Note": "1.0" }]',
    });
    await clickSend();
    expect(send.mock.calls[0][0].body).toBe(
      '[{"Id":9007199254740993,"Price":1.0,"Delta":-0,"Huge":1e400,"Note":"1.0","Tags":["mock-data"]}]',
    );
  });

  it.each([
    ["PATCH", "/Employee/1"],
    ["PUT", "/Employee/1"],
  ] as const)("sends the body text unchanged on %s %s, which is not tagged, and shows no note", async (method, line) => {
    renderWith({ method, requestLine: line, bodyText: '{ "Name": "Ann" }' });
    expect(screen.queryByText(/tagged mock-data/)).not.toBeInTheDocument();
    await clickSend();
    expect(send.mock.calls[0][0].body).toBe('{ "Name": "Ann" }');
  });
});

describe("RestWorkspace: validation before sending", () => {
  it('invalid JSON shows "The body isn\'t valid JSON (line 2)" and does not send', async () => {
    renderWith({ method: "POST", requestLine: "/Employee", bodyText: '{\n  "Name": }' });
    await clickSend();
    expect(screen.getByRole("alert")).toHaveTextContent("The body isn't valid JSON (line 2)");
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(bodyField(), { target: { value: '{ "Name": "Ann" }' } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["/Employee", '{"Name":"a","Age":1,"Age":2}', "Age"],
    ["/Employee:insertMany", '[{"A":{"x":1},"A":{"y":"s"}}]', "A"],
  ])(
    "a duplicate key on tagged POST %s shows the duplicate-key message and does not send",
    { timeout: 2000 },
    async (line, bodyText, key) => {
      // A synchronous loop can't be stopped by the timeout alone, so fail once tagging draws far more nonces than it
      // needs.
      let drawn = 0;
      const random = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
      vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T) => {
        if (++drawn > 20) throw new Error("drew more than 20 nonces: the retry loop does not end");
        return random(array);
      });
      try {
        renderWith({ method: "POST", requestLine: line, bodyText });
        await clickSend();
        expect(screen.getByRole("alert")).toHaveTextContent(
          `The body has a duplicate key "${key}". Remove one of them.`,
        );
        expect(send).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
      }
    },
  );

  it("a body nested too deep to tag shows the too-deep message and does not send", async () => {
    const bodyText = `[${'{"a":'.repeat(20_000)}1${"}".repeat(20_000)}]`;
    renderWith({ method: "POST", requestLine: "/Employee:insertMany", bodyText });
    await clickSend();
    expect(screen.getByRole("alert")).toHaveTextContent("The body is nested too deeply to send from the playground.");
    expect(send).not.toHaveBeenCalled();
  });

  it('{itemId} still in the path shows "Replace {itemId} with a record id." and does not send', async () => {
    renderWith({ method: "GET", requestLine: "/Employee/{itemId}", bodyText: "" });
    await clickSend();
    expect(screen.getByRole("alert")).toHaveTextContent("Replace {itemId} with a record id.");
    expect(send).not.toHaveBeenCalled();
  });

  it("a loaded draft with {itemId} focuses the path and selects the placeholder", () => {
    renderWith({ method: "GET", requestLine: "/Employee/{itemId}?select=Name", bodyText: "" });
    const input = pathField();
    expect(input).toHaveFocus();
    expect(input.value.slice(input.selectionStart!, input.selectionEnd!)).toBe("{itemId}");
  });

  it("guard refusal shows its message under the path and does not send", async () => {
    renderWith({ method: "GET", requestLine: "/Employee//1", bodyText: "" });
    await clickSend();
    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent("The path has an empty segment (//). Remove the extra slash.");
    expect(pathField()).toHaveAttribute("aria-describedby", message.id);
    expect(pathField()).toHaveAttribute("aria-invalid", "true");
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["DELETE", "/Employee/%2e?hardDelete=true", ""],
    ["POST", "/Employee:deleteMany/%2e", '{"where":{}}'],
    ["POST", "/Employee/%2e%2e/Order:deleteMany?hardDelete=true", '{"where":{}}'],
  ] as const)(
    "refuses a crafted %s %s as a dot segment before any confirm, and never sends it",
    async (method, line, body) => {
      renderWith({ method, requestLine: line, bodyText: body });
      await clickSend();
      expect(screen.getByRole("alert")).toHaveTextContent("The path has a . or .. segment. Remove it.");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("refuses a path with a bad percent escape and never sends it", async () => {
    renderWith({ method: "GET", requestLine: "/Employee/%zz", bodyText: "" });
    await clickSend();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The path has a % that doesn't start a valid escape. Fix it, or encode the % as %25.",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a # in the path", async () => {
    renderWith({ method: "GET", requestLine: "/Employee#top?pageNo=1", bodyText: "" });
    await clickSend();
    expect(screen.getByRole("alert")).toHaveTextContent("The path can't contain ? or #.");
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the refusal when sendRestRequest throws RestPathError", async () => {
    send.mockRejectedValueOnce(new RestPathError("escapes-base"));
    renderWith({ method: "GET", requestLine: "/Employee", bodyText: "" });
    await clickSend();
    expect(await screen.findByRole("alert")).toHaveTextContent("The path leads outside the gateway.");
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("clears the path message once the path is edited", async () => {
    renderWith({ method: "GET", requestLine: "Employee", bodyText: "" });
    await clickSend();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(pathField(), { target: { value: "/Employee" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("RestWorkspace: confirm before bulk and hard deletes", () => {
  const FILTER_COPY = "This changes every record that matches the filter.";
  it.each([
    ["POST", "/Employee:updateMany", '{"where":{},"input":{}}', FILTER_COPY, "Update records"],
    ["POST", "/Employee:deleteMany", '{"where":{}}', FILTER_COPY, "Delete records"],
    ["DELETE", "/Employee/1?hardDelete=true", "", "This permanently deletes the record.", "Delete permanently"],
    [
      "POST",
      "/Employee:deleteMany?hardDelete=true",
      '{"where":{}}',
      "Delete every matching record permanently?This permanently deletes every record that matches the filter.",
      "Delete permanently",
    ],
    ["POST", "/Employee:UpdateMany", '{"where":{},"input":{}}', FILTER_COPY, "Update records"],
    ["POST", "/Employee%3AdeleteMany", '{"where":{}}', FILTER_COPY, "Delete records"],
  ] as const)("%s %s asks to confirm; Cancel sends nothing; confirm sends", async (method, line, body, copy, action) => {
    renderWith({ method, requestLine: line, bodyText: body });
    await clickSend();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(copy);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(send).not.toHaveBeenCalled();

    await clickSend();
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: action }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ method, path: line.split("?")[0] });
  });

  it.each([
    ["DELETE", "/Employee/1", ""],
    ["POST", "/Employee:query", '{"where":{}}'],
    ["POST", "/Employee:insertMany", "[]"],
  ] as const)("%s %s sends without asking", async (method, line, body) => {
    renderWith({ method, requestLine: line, bodyText: body });
    await clickSend();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("RestWorkspace: concurrency", () => {
  it("a second Send aborts the first", async () => {
    pendingSend();
    renderWith({ method: "GET", requestLine: "/Employee", bodyText: "" });
    await clickSend();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    fireEvent.keyDown(pathField(), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0][1]!.aborted).toBe(true);
    expect(send.mock.calls[1][1]!.aborted).toBe(false);
  });

  it("ignores the result of a superseded send", async () => {
    let resolveFirst!: (response: RestResponse) => void;
    let resolveSecond!: (response: RestResponse) => void;
    // The first send ignores its abort, as one in the middle of a 401 refresh can, and answers late.
    send
      .mockImplementationOnce(() => new Promise((done) => (resolveFirst = done)))
      .mockImplementationOnce(() => new Promise((done) => (resolveSecond = done)));

    renderWith({ method: "GET", requestLine: "/Employee", bodyText: "" });
    await clickSend();
    fireEvent.keyDown(pathField(), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));

    await act(async () => resolveSecond(ok(200)));
    expect(await screen.findByText("200 OK")).toBeInTheDocument();
    await act(async () => resolveFirst(ok(500)));
    expect(screen.getByText("200 OK")).toBeInTheDocument();
    expect(screen.queryByText(/^500/)).not.toBeInTheDocument();
  });

  it("Cancel aborts", async () => {
    pendingSend();
    renderWith({ method: "GET", requestLine: "/Employee", bodyText: "" });
    await clickSend();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(send.mock.calls[0][1]!.aborted).toBe(true);
    expect(screen.getByText("Request cancelled.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});

describe("RestWorkspace: params, path suggestions and headers", () => {
  it("Params rows edit the request line and vice versa", async () => {
    renderWith({ method: "GET", requestLine: "/Employee?pageNo=1", bodyText: "" });
    const values = () => screen.getAllByRole("textbox", { name: "Parameter value" }) as HTMLInputElement[];
    expect(screen.getByRole("textbox", { name: "Parameter name" })).toHaveValue("pageNo");
    fireEvent.change(values()[0], { target: { value: "2" } });
    expect(pathField()).toHaveValue("/Employee?pageNo=2");

    fireEvent.change(pathField(), { target: { value: "/Employee?pageNo=2&pageSize=5" } });
    const names = screen.getAllByRole("textbox", { name: "Parameter name" }) as HTMLInputElement[];
    expect(names.map((n) => n.value)).toEqual(["pageNo", "pageSize"]);
    expect(values()[1]).toHaveValue("5");

    await userEvent.click(screen.getAllByRole("button", { name: "Remove parameter" })[0]);
    expect(pathField()).toHaveValue("/Employee?pageSize=5");

    // A new row without a name stays on screen and leaves the line alone until it is named.
    await userEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    expect(screen.getAllByRole("textbox", { name: "Parameter name" })).toHaveLength(2);
    expect(pathField()).toHaveValue("/Employee?pageSize=5");
    await userEvent.type(screen.getAllByRole("textbox", { name: "Parameter name" })[1], "order");
    expect(pathField()).toHaveValue("/Employee?pageSize=5&order=");
  });

  it("Params suggests pageNo, pageSize, order, select, includeTotalCount for GET /E", async () => {
    renderWith({ method: "GET", requestLine: "/Employee", bodyText: "" });
    for (const key of ["pageNo", "pageSize", "order", "select", "includeTotalCount"]) {
      expect(screen.getByRole("button", { name: `Add ${key}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Add hardDelete" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add pageSize" }));
    expect(pathField()).toHaveValue("/Employee?pageSize=");
    expect(screen.queryByRole("button", { name: "Add pageSize" })).not.toBeInTheDocument();
  });

  const suggestedParams = () =>
    screen
      .queryAllByRole("button", { name: /^Add (?!parameter)/ })
      .map((button) => button.getAttribute("aria-label")!.slice("Add ".length));

  it.each([
    ["GET", "/Employee/1", ["select"]],
    ["DELETE", "/Employee/1", ["hardDelete"]],
    ["POST", "/Employee:deleteMany", ["hardDelete"]],
    ["POST", "/Employee:query", []],
    ["POST", "/Employee:updateMany", []],
    ["PATCH", "/Employee/1", []],
  ] as const)("Params suggests %s %s: %j", async (method, line, keys) => {
    renderWith({ method, requestLine: line, bodyText: "" });
    await userEvent.click(screen.getByRole("tab", { name: "Params" }));
    expect(suggestedParams()).toEqual(keys);
  });

  it("the path field suggests entity names, then /{itemId} and the four :verbs", () => {
    renderWith({ method: "GET", requestLine: "/", bodyText: "" });
    const options = () =>
      [...document.getElementById(pathField().getAttribute("list")!)!.querySelectorAll("option")].map(
        (o) => o.value,
      );
    expect(options()).toEqual(["/Employee", "/Order"]);
    fireEvent.change(pathField(), { target: { value: "/Employee" } });
    expect(options()).toEqual([
      "/Employee",
      "/Order",
      "/Employee/{itemId}",
      "/Employee:query",
      "/Employee:insertMany",
      "/Employee:updateMany",
      "/Employee:deleteMany",
    ]);
    // Still offered once a verb is being typed.
    fireEvent.change(pathField(), { target: { value: "/Employee:" } });
    expect(options()).toContain("/Employee:deleteMany");
  });

  it("Headers tab lists x-blocks-key and Content-Type read-only", async () => {
    const { load } = renderWith({ method: "POST", requestLine: "/Employee", bodyText: "{}" });
    await userEvent.click(screen.getByRole("tab", { name: "Headers" }));
    const panel = screen.getByRole("tabpanel", { name: "Headers" });
    expect(panel).toHaveTextContent("x-blocks-key:(console key)");
    expect(panel).toHaveTextContent("Content-Type:application/json");
    expect(panel).toHaveTextContent("Requests use your console session.");
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();

    load({ method: "GET", requestLine: "/Employee", bodyText: "" });
    await userEvent.click(screen.getByRole("tab", { name: "Headers" }));
    expect(screen.getByRole("tabpanel", { name: "Headers" })).not.toHaveTextContent("Content-Type");
  });
});

describe("RestWorkspace: body JSON Schema", () => {
  it("changing the entity in the path switches body suggestions to that entity's schema", () => {
    renderWith({ method: "POST", requestLine: "/Employee", bodyText: "{}" });
    let registered = lastSchema().schemas;
    expect(registered).toHaveLength(1);
    expect(registered[0].fileMatch).toEqual([bodyField().dataset.path]);
    expect(Object.keys(registered[0].schema.properties)).toEqual(["Name", "Address", "Tags"]);
    // DTO-typed fields get their children from the DTO list.
    expect(registered[0].schema.properties.Address.properties).toEqual({ City: { type: "string" } });

    fireEvent.change(pathField(), { target: { value: "/Order" } });
    registered = lastSchema().schemas;
    expect(Object.keys(registered[0].schema.properties)).toEqual(["Total", "Tags"]);

    fireEvent.change(pathField(), { target: { value: "/Unknown" } });
    expect(lastSchema().schemas).toEqual([]);
  });

  it("uses the route's schema: insertMany is an array of records", () => {
    renderWith({ method: "POST", requestLine: "/Order:insertMany", bodyText: "[]" });
    expect(lastSchema().schemas[0].schema).toMatchObject({ type: "array", items: { type: "object" } });
  });
});

describe("draft helpers", () => {
  it("loadTemplate joins the path and query and pretty-prints the body", () => {
    expect(
      loadTemplate({
        group: "insert",
        id: "insert",
        method: "POST",
        path: "/E",
        query: [["a", "1"]],
        body: { Name: "x" },
      }),
    ).toEqual({ method: "POST", requestLine: "/E?a=1", bodyText: '{\n  "Name": "x"\n}' });
    expect(
      loadTemplate({ group: "delete", id: "delete", method: "DELETE", path: "/E/{itemId}", query: [] }),
    ).toEqual({ method: "DELETE", requestLine: "/E/{itemId}", bodyText: "" });
  });

  it("requestToDraft keeps the body text", () => {
    expect(requestToDraft({ method: "POST", path: "/E:updateMany", query: [], body: '{"where":{}}' })).toEqual({
      method: "POST",
      requestLine: "/E:updateMany",
      bodyText: '{"where":{}}',
    });
    expect(requestToDraft({ method: "GET", path: "/E", query: [["pageNo", "1"]] })).toEqual({
      method: "GET",
      requestLine: "/E?pageNo=1",
      bodyText: "",
    });
  });
});

describe("RestWorkspace: a new draft while a request is in flight", () => {
  it("aborts the request quietly: the previous response stays and a late result is ignored", async () => {
    let resolveLate!: (response: RestResponse) => void;
    send
      .mockResolvedValueOnce(ok(200))
      // Ignores its abort, as one in the middle of a 401 refresh can, and answers late.
      .mockImplementationOnce(() => new Promise((done) => (resolveLate = done)));
    const { load } = renderWith({ method: "GET", requestLine: "/Employee", bodyText: "" });
    await clickSend();
    expect(await screen.findByText("200 OK")).toBeInTheDocument();
    await clickSend();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    load({ method: "GET", requestLine: "/Order", bodyText: "" });
    expect(send.mock.calls[1][1]!.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByText("200 OK")).toBeInTheDocument();
    expect(screen.queryByText("Request cancelled.")).not.toBeInTheDocument();

    await act(async () => resolveLate(ok(500)));
    expect(screen.getByText("200 OK")).toBeInTheDocument();
    expect(screen.queryByText(/^500/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});

describe("RestWorkspace: method and suggested params", () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
    Element.prototype.setPointerCapture ??= vi.fn() as never;
    Element.prototype.releasePointerCapture ??= vi.fn() as never;
  });

  it("choosing PATCH in the method list changes the bar, shows the Body tab and sends PATCH", async () => {
    renderWith({ method: "GET", requestLine: "/Employee/1", bodyText: "" });
    expect(screen.queryByRole("tab", { name: "Body" })).not.toBeInTheDocument();
    const method = screen.getByRole("combobox", { name: "Method" });
    expect(method).toHaveTextContent("GET");

    await userEvent.click(method);
    await userEvent.click(await screen.findByRole("option", { name: "PATCH" }));
    expect(screen.getByRole("combobox", { name: "Method" })).toHaveTextContent("PATCH");
    expect(screen.getByRole("tab", { name: "Body" })).toBeInTheDocument();

    await clickSend();
    expect(send.mock.calls[0][0]).toMatchObject({ method: "PATCH", path: "/Employee/1" });
  });

  it("a suggested key focuses its new row once, so a row that remounts later does not take the focus", async () => {
    renderWith({ method: "GET", requestLine: "/Employee", bodyText: "" });
    await userEvent.click(screen.getByRole("button", { name: "Add pageSize" }));
    expect(screen.getByRole("textbox", { name: "Parameter value" })).toHaveFocus();

    // Clearing the path drops every row; typing a query brings a row back, mounted anew.
    await userEvent.clear(pathField());
    await userEvent.type(pathField(), "/Employee?a=1");
    expect(pathField()).toHaveFocus();
    expect(pathField()).toHaveValue("/Employee?a=1");
  });
});
