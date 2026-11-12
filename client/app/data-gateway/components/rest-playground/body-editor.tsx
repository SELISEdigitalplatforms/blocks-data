"use client";

import type { OnMount } from "@monaco-editor/react";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { useEffect, useRef, useState } from "react";
import { PlaygroundMonacoEditor, usePlaygroundMonacoTheme } from "../playground/monaco-editor";

type Monaco = Parameters<OnMount>[1];

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: "on",
  folding: true,
  formatOnPaste: true,
} as const;

let nextInstance = 0;

/** A stable model and schema URI per editor, so the schema's fileMatch names this editor's model only. */
const instanceUris = () => {
  nextInstance += 1;
  const base = `inmemory://rest-playground/body-${nextInstance}`;
  return { modelUri: `${base}.json`, schemaUri: `${base}.schema.json` };
};

/**
 * Registers `schema` for `modelUri` in Monaco's JSON defaults, keeping the flags already set and the schemas other
 * editors registered.
 */
function registerSchema(
  monaco: Monaco,
  uris: { modelUri: string; schemaUri: string },
  schema: object | null,
) {
  const defaults = monaco.languages.json.jsonDefaults;
  const others = (defaults.diagnosticsOptions?.schemas ?? []).filter(
    (entry) => entry.uri !== uris.schemaUri,
  );
  defaults.setDiagnosticsOptions({
    ...defaults.diagnosticsOptions,
    validate: true,
    schemas: schema
      ? [...others, { uri: uris.schemaUri, fileMatch: [uris.modelUri], schema }]
      : others,
  });
}

type BodyEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** JSON Schema for the route's body; null when the route or entity is unknown. */
  schema: object | null;
  error: string | null;
  onSend: () => void;
};

export function BodyEditor({ value, onChange, schema, error, onSend }: BodyEditorProps) {
  const { t } = useT("data.gateway.schema");
  const theme = usePlaygroundMonacoTheme();
  const [uris] = useState(instanceUris);
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const onSendRef = useRef(onSend);

  // Monaco keeps the action from mount; it reads the latest onSend through this ref.
  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    if (monaco) registerSchema(monaco, uris, schema);
  }, [monaco, uris, schema]);

  useEffect(
    () => () => {
      if (monaco) registerSchema(monaco, uris, null);
    },
    [monaco, uris],
  );

  const handleMount: OnMount = (editor, instance) => {
    // An action, not addCommand: addCommand binds globally (no `when` clause) and is never disposed, so it would
    // fire in the GraphQL editor mounted beside this one, and after this editor unmounts. An action's keybinding has
    // a condition scoped to this editor's id, so it fires only in this editor. Monaco doesn't dispose the binding
    // when the editor goes, but no other editor has that id, so it can't fire again.
    // Ctrl+Enter everywhere, Cmd+Enter on a Mac (CtrlCmd), and Ctrl+Enter on a Mac too (WinCtrl).
    editor.addAction({
      id: "rest-playground.send",
      label: t("REST_PLAYGROUND.SEND"),
      keybindings: [
        instance.KeyMod.CtrlCmd | instance.KeyCode.Enter,
        instance.KeyMod.WinCtrl | instance.KeyCode.Enter,
      ],
      run: () => onSendRef.current(),
    });
    setMonaco(instance);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="group"
        aria-label={t("REST_PLAYGROUND.BODY_EDITOR")}
        className="min-h-[200px] flex-1 overflow-hidden"
      >
        <PlaygroundMonacoEditor
          height="100%"
          language="json"
          path={uris.modelUri}
          theme={theme}
          value={value}
          onChange={(next) => onChange(next ?? "")}
          onMount={handleMount}
          options={EDITOR_OPTIONS}
        />
      </div>
      {error && (
        <p role="alert" className="shrink-0 border-t border-border/40 px-4 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
