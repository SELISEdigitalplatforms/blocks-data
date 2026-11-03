import { render, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BodyEditor } from "./body-editor";

type SchemaEntry = { uri: string; fileMatch?: string[]; schema?: unknown };
type Options = { schemas?: SchemaEntry[]; [flag: string]: unknown };

const fake = vi.hoisted(() => {
  const json = { diagnosticsOptions: {} as Options, setDiagnosticsOptions: vi.fn() };
  json.setDiagnosticsOptions.mockImplementation((options: Options) => {
    json.diagnosticsOptions = options;
  });
  return {
    json,
    monaco: {
      KeyMod: { CtrlCmd: 2048, WinCtrl: 256 },
      KeyCode: { Enter: 3 },
      languages: { json: { jsonDefaults: json } },
    },
  };
});

vi.mock("../playground/monaco-editor", async () => {
  const { useEffect } = await import("react");
  function MockEditor({ path, onMount }: { path?: string; onMount?: (editor: unknown, monaco: unknown) => void }) {
    useEffect(() => {
      onMount?.({ addAction: () => ({ dispose: () => {} }) }, fake.monaco);
      // Mount once, like Monaco.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <textarea aria-label="Body editor" data-path={path} readOnly />;
  }
  return { PlaygroundMonacoEditor: MockEditor, usePlaygroundMonacoTheme: () => "light" };
});

const SCHEMA_A = { type: "object", properties: { A: { type: "string" } } };
const SCHEMA_B = { type: "object", properties: { B: { type: "string" } } };

const editor = (schema: object | null) => (
  <BodyEditor value="{}" onChange={() => {}} schema={schema} error={null} onSend={() => {}} />
);
const schemas = () => fake.json.diagnosticsOptions.schemas ?? [];

beforeEach(() => {
  fake.json.setDiagnosticsOptions.mockClear();
  fake.json.diagnosticsOptions = {};
});

describe("BodyEditor: JSON Schema registration", () => {
  it("keeps the JSON defaults already set when it registers its schema", () => {
    const other: SchemaEntry = { uri: "inmemory://other.schema.json", fileMatch: ["other.json"], schema: {} };
    fake.json.diagnosticsOptions = {
      allowComments: true,
      enableSchemaRequest: true,
      trailingCommas: "warning",
      schemas: [other],
    };
    const { getByRole } = render(editor(SCHEMA_A));
    const modelUri = getByRole("textbox", { name: "Body editor" }).dataset.path!;

    expect(fake.json.diagnosticsOptions).toEqual({
      allowComments: true,
      enableSchemaRequest: true,
      trailingCommas: "warning",
      validate: true,
      schemas: [other, { uri: expect.any(String), fileMatch: [modelUri], schema: SCHEMA_A }],
    });
  });

  it("on unmount removes only its own schema entry and keeps another editor's", () => {
    const first = render(editor(SCHEMA_A));
    const second = render(editor(SCHEMA_B));
    expect(schemas().map((entry) => entry.schema)).toEqual([SCHEMA_A, SCHEMA_B]);
    fake.json.diagnosticsOptions = { ...fake.json.diagnosticsOptions, enableSchemaRequest: true };

    first.unmount();
    const modelUri = second.getByRole("textbox", { name: "Body editor" }).dataset.path!;
    expect(schemas()).toEqual([{ uri: expect.any(String), fileMatch: [modelUri], schema: SCHEMA_B }]);
    expect(fake.json.diagnosticsOptions.enableSchemaRequest).toBe(true);

    second.unmount();
    expect(schemas()).toEqual([]);
  });

  it("keeps exactly one entry for itself as its schema changes A to B to null, and another editor's entry", () => {
    const other = render(editor(SCHEMA_B));
    const mine = render(editor(SCHEMA_A));
    const myUri = within(mine.container).getByRole("textbox", { name: "Body editor" }).dataset.path!;
    const otherUri = within(other.container).getByRole("textbox", { name: "Body editor" }).dataset.path!;
    const forMe = () => schemas().filter((entry) => entry.fileMatch?.includes(myUri));
    const forOther = () => schemas().filter((entry) => entry.fileMatch?.includes(otherUri));
    expect(forMe().map((entry) => entry.schema)).toEqual([SCHEMA_A]);

    mine.rerender(editor(SCHEMA_B));
    expect(forMe().map((entry) => entry.schema)).toEqual([SCHEMA_B]);
    expect(forOther().map((entry) => entry.schema)).toEqual([SCHEMA_B]);
    expect(schemas()).toHaveLength(2);

    mine.rerender(editor(null));
    expect(forMe()).toEqual([]);
    expect(forOther().map((entry) => entry.schema)).toEqual([SCHEMA_B]);
    expect(schemas()).toHaveLength(1);
  });
});
