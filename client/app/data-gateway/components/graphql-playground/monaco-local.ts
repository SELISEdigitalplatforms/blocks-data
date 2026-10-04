import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

// Serve Monaco from our own bundle instead of the jsdelivr CDN default, which the
// server CSP (script-src 'self') blocks.
self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) =>
    label === "json" ? new JsonWorker() : new EditorWorker(),
};

loader.config({ monaco });
