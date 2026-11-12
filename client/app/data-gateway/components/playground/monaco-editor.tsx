"use client";

import type { EditorProps } from "@monaco-editor/react";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { lazy, Suspense, useEffect, useState } from "react";

const MonacoEditorLazy = lazy(async () => {
  await import("../graphql-playground/monaco-local");
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

function MonacoEditorFallback() {
  const { t } = useT("data.gateway.schema");
  return (
    <div className="flex h-full w-full items-center justify-center">
      {t("GRAPHQL_PLAYGROUND_PAGE.LOADING_EDITOR")}
    </div>
  );
}

/** The lazy Monaco editor shared by the GraphQL and REST playgrounds. */
export const PlaygroundMonacoEditor = (props: EditorProps) => (
  <Suspense fallback={<MonacoEditorFallback />}>
    <MonacoEditorLazy {...props} />
  </Suspense>
);

type PlaygroundMonacoTheme = "vs-dark" | "light";

const resolveTheme = (): PlaygroundMonacoTheme =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "vs-dark"
    : "light";

/** The Monaco theme matching the app's light/dark class on the root element, kept current as it changes. */
export function usePlaygroundMonacoTheme(): PlaygroundMonacoTheme {
  const [theme, setTheme] = useState<PlaygroundMonacoTheme>(resolveTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(resolveTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
