"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui-kits/tabs/tabs";
import { useGetProject } from "@/hooks/use-project";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import type { EditorProps } from "@monaco-editor/react";
import { isListType, isNonNullType, isObjectType } from "graphql";
import { BookOpen, Keyboard, Play, Trash2 } from "lucide-react";
import type { editor, IDisposable, languages, Position } from "monaco-editor";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useExecuteGraphQL,
  useGraphQLIntrospection,
  useRawIntrospectionQuery,
  useSchemaList,
} from "../../hooks/use-configuration";
import type { ISchemaDetails } from "../../models/data-service";
import {
  detectCurrentFieldName,
  detectOperationContext,
  getArgumentSuggestions,
  getFieldSuggestions,
  getFullMutationSnippets,
  getFullQuerySnippets,
  getInputFieldSuggestions,
  getMutationSuggestions,
  getQuerySuggestions,
  resolveInputBlockPath,
  resolveInputObjectTypeAtCursor,
  type IntrospectionSuggestion,
} from "../../utils/introspection-utils";
import { CleanTestDataModal } from "./clean-test-data-modal";
import { SchemasDrawer } from "./schemas-drawer";

const MonacoEditorLazy = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.default })),
);

const monacoEditorFallback = (
  <div className="flex h-full w-full items-center justify-center">
    Loading editor...
  </div>
);

const GraphqlMonacoEditor = (props: EditorProps) => (
  <Suspense fallback={monacoEditorFallback}>
    <MonacoEditorLazy {...props} />
  </Suspense>
);

interface ResponseTab {
  id: string;
  name: string;
  content: string;
}

export const GraphQLPlaygroundPage = () => {
  const [query, setQuery] = useState(
    `# Write your GraphQL query/mutation here`,
  );
  const [responses, setResponses] = useState<ResponseTab[]>([]);
  const [activeResponseTab, setActiveResponseTab] = useState<string>("");
  const [isCleanDataModalOpen, setIsCleanDataModalOpen] = useState(false);
  const [isSchemasDrawerOpen, setIsSchemasDrawerOpen] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const completionDisposableRef = useRef<IDisposable | null>(null);
  const codeLensDisposableRef = useRef<IDisposable | null>(null);
  const selectedProject = useProjectStore().selectedProject;
  const { setSelectedProject } = useProjectStore();
  const { data: projectData } = useGetProject({
    projectId: selectedProject?.itemId || "",
  });
  const projectKey = selectedProject?.tenantId || "";
  const projectShortKey = selectedProject?.tenantSlug || "";

  useEffect(() => {
    if (
      projectData?.data &&
      selectedProject?.itemId === projectData.data.itemId
    ) {
      setSelectedProject(projectData.data);
    }
  }, [projectData, selectedProject?.itemId, setSelectedProject]);
  const [monacoTheme, setMonacoTheme] = useState<
    NonNullable<EditorProps["theme"]>
  >("light");

  useEffect(() => {
    const resolveTheme = () =>
      document.documentElement.classList.contains("dark")
        ? "vs-dark"
        : "light";

    setMonacoTheme(resolveTheme());

    const observer = new MutationObserver(() => {
      setMonacoTheme(resolveTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const { mutateAsync: executeGraphQL, isPending: isLoading } =
    useExecuteGraphQL();
  const {
    data: schemasIntrospectionData,
    isPending: isSchemasIntrospectionPending,
    isFetching: isSchemasIntrospectionFetching,
  } = useRawIntrospectionQuery({
    projectShortKey,
    enabled: isSchemasDrawerOpen && !!projectShortKey,
  });

  const handleFetchSchemas = () => {
    setIsSchemasDrawerOpen(true);
  };

  const isSchemasDrawerLoading =
    isSchemasDrawerOpen &&
    !!projectShortKey &&
    (isSchemasIntrospectionPending ||
      (isSchemasIntrospectionFetching &&
        schemasIntrospectionData === undefined));

  const handleUseQueryFromSchemas = useCallback((queryText: string) => {
    setQuery(queryText);
    setIsSchemasDrawerOpen(false);
    setResponses([]);
    setActiveResponseTab("");
  }, []);

  // Fetch introspected schema for accurate autocompletion
  const { data: introspectedSchema } = useGraphQLIntrospection({
    projectShortKey,
    enabled: !!projectShortKey && !!projectKey,
  });

  // Load query from localStorage if coming from "Try in Playground"
  useEffect(() => {
    const storedQuery = localStorage.getItem("graphql-playground-query");
    if (storedQuery) {
      setQuery(storedQuery);
      // Clear the stored query after loading
      localStorage.removeItem("graphql-playground-query");
    }
  }, []);

  // Fetch entity schemas
  const { data: schemaListResponse } = useSchemaList({
    keyword: "",
    pageNo: 1,
    pageSize: 200,
    sortDescending: true,
    sortBy: "CreatedDate",
    projectKey,
    schemaType: "Entity",
  });

  // Fetch DTO schemas for nested type resolution
  const { data: dtoListResponse } = useSchemaList({
    keyword: "",
    pageNo: 1,
    pageSize: 200,
    sortDescending: true,
    sortBy: "CreatedDate",
    projectKey,
    schemaType: "DTO",
  });

  const schemas = useMemo(
    () => schemaListResponse?.data?.items || [],
    [schemaListResponse?.data?.items],
  );

  const dtoSchemas = useMemo(
    () => dtoListResponse?.data?.items || [],
    [dtoListResponse?.data?.items],
  );

  // Build DTO preview map with recursive resolution
  const dtoPreviewMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();

    // Create lookup map
    const schemaByName = new Map<string, ISchemaDetails>();
    dtoSchemas.forEach((item) => {
      if (item?.schemaName) {
        schemaByName.set(item.schemaName.trim(), item);
      }
    });

    // Recursive DTO structure builder
    const buildDtoStructure = (
      schemaName: string,
      visited: Set<string> = new Set(),
      depth: number = 0,
    ): Record<string, unknown> | null => {
      if (depth > 10 || visited.has(schemaName)) return null;

      const schema = schemaByName.get(schemaName);
      if (!schema) return null;

      visited.add(schemaName);
      const dtoFields: Record<string, unknown> = {};

      (schema.fields ?? []).forEach((field) => {
        if (!field?.name) return;

        const fieldTypeName = field.type?.trim();

        // Check if field type is another DTO
        if (fieldTypeName && schemaByName.has(fieldTypeName)) {
          const nestedStructure = buildDtoStructure(
            fieldTypeName,
            new Set(visited),
            depth + 1,
          );

          if (nestedStructure) {
            dtoFields[field.name] = field.isArray
              ? [nestedStructure]
              : nestedStructure;
          } else {
            dtoFields[field.name] = field.isArray ? [""] : "";
          }
        } else {
          // Primitive type
          dtoFields[field.name] = field.isArray ? [""] : "";
        }
      });

      visited.delete(schemaName);
      return dtoFields;
    };

    // Build map for all DTOs
    dtoSchemas.forEach((item) => {
      if (!item?.schemaName) return;
      const structure = buildDtoStructure(item.schemaName.trim());
      if (structure) {
        map.set(item.schemaName.trim(), structure);
      }
    });

    return map;
  }, [dtoSchemas]);

  // Monaco initialization state
  const [isMonacoReady, setIsMonacoReady] = useState(false);

  // Helper function to generate field snippets with nested DTO support
  const generateFieldSnippet = useCallback(
    (schema: ISchemaDetails): string => {
      if (!schema.fields || schema.fields.length === 0) {
        return "${1:# Select fields}";
      }

      // Helper to recursively format nested objects (similar to schema-preview-drawer)
      const formatNestedSelection = (
        obj: Record<string, unknown>,
        indentLevel: number,
      ): string[] => {
        const indent = "      ".repeat(indentLevel);
        const lines: string[] = [];

        Object.entries(obj).forEach(([key, value]) => {
          // Handle array of DTOs
          if (Array.isArray(value) && value.length > 0) {
            const firstItem = value[0];
            if (typeof firstItem === "object" && firstItem !== null) {
              lines.push(`${indent}${key} {`);
              const innerLines = formatNestedSelection(
                firstItem as Record<string, unknown>,
                indentLevel + 1,
              );
              lines.push(...innerLines);
              lines.push(`${indent}}`);
              return;
            }
          }

          // Handle single DTO object
          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            lines.push(`${indent}${key} {`);
            const innerLines = formatNestedSelection(
              value as Record<string, unknown>,
              indentLevel + 1,
            );
            lines.push(...innerLines);
            lines.push(`${indent}}`);
            return;
          }

          // Primitive field
          lines.push(`${indent}${key}`);
        });

        return lines;
      };

      // Build field list with nested DTOs
      const lines: string[] = [];
      schema.fields.forEach((field) => {
        const fieldTypeName = field.type?.trim();

        // Check if this field is a DTO (has nested object in preview data)
        if (fieldTypeName && dtoPreviewMap.has(fieldTypeName)) {
          const nestedStructure = dtoPreviewMap.get(fieldTypeName);
          if (nestedStructure) {
            lines.push(`${field.name} {`);
            const nestedLines = formatNestedSelection(nestedStructure, 1);
            lines.push(...nestedLines);
            lines.push("}");
          } else {
            lines.push(field.name);
          }
        } else {
          // Simple field
          lines.push(field.name);
        }
      });

      return lines.join("\n    ");
    },
    [dtoPreviewMap],
  );

  // Parse GraphQL operations from text
  const parseOperations = useCallback((text: string) => {
    const operations: Array<{
      type: string;
      name: string;
      startLine: number;
      endLine: number;
      text: string;
    }> = [];
    const lines = text.split("\n");

    let currentOperation: {
      type: string;
      name: string;
      startLine: number;
      text: string;
    } | null = null;
    let braceDepth = 0;

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Detect operation start (query or mutation)
      const operationMatch = line.match(/^\s*(query|mutation)\s*(\w*)\s*{/);

      if (operationMatch && braceDepth === 0) {
        currentOperation = {
          type: operationMatch[1],
          name: operationMatch[2] || "Unnamed",
          startLine: lineNumber,
          text: line,
        };
        braceDepth = 1;
      } else if (currentOperation) {
        currentOperation.text += "\n" + line;

        // Count braces
        for (const char of line) {
          if (char === "{") braceDepth++;
          else if (char === "}") braceDepth--;
        }

        // Operation complete
        if (braceDepth === 0) {
          operations.push({
            ...currentOperation,
            endLine: lineNumber,
          });
          currentOperation = null;
        }
      }
    });

    return operations;
  }, []);

  // Helper function to inject "mock-data" tag into insert operations
  const injectMockDataTag = useCallback((queryText: string): string => {
    // Only process insert operations
    if (!queryText.trim().match(/insert\w+\s*\(/i)) {
      return queryText;
    }

    // Step 1: Find the input: [ or input: { block
    const inputStartMatch = queryText.match(/(input\s*:\s*[\{\[])/i);
    if (!inputStartMatch || inputStartMatch.index === undefined) {
      return queryText;
    }

    const inputMarkerEnd = inputStartMatch.index + inputStartMatch[0].length;
    const isArray = queryText[inputMarkerEnd - 1] === "[";
    const openCharIndex = inputMarkerEnd - 1;

    // Track depth to find matching closing bracket/brace
    let depth = 1;
    let pos = openCharIndex + 1;
    const openChar = isArray ? "[" : "{";
    const closeChar = isArray ? "]" : "}";

    while (pos < queryText.length && depth > 0) {
      if (queryText[pos] === openChar) depth++;
      else if (queryText[pos] === closeChar) depth--;
      if (depth > 0) pos++;
    }

    if (depth !== 0) return queryText; // Malformed query

    const inputContent = queryText.substring(openCharIndex + 1, pos);

    // Helper: Process a single object to inject Tags
    const processSingleObject = (objStr: string): string => {
      let scanDepth = 0;
      let topLevelTagsStart = -1;
      let topLevelTagsEnd = -1;
      let k = 0;

      while (k < objStr.length) {
        const ch = objStr[k];

        if (ch === "{" || ch === "[") {
          scanDepth++;
          k++;
          continue;
        }

        if (ch === "}" || ch === "]") {
          scanDepth--;
          k++;
          continue;
        }

        if (scanDepth === 1) {
          const rest = objStr.substring(k);
          const tagsKeyMatch = rest.match(/^Tags\s*:\s*\[/i);

          if (tagsKeyMatch) {
            topLevelTagsStart = k;
            const bracketOpenOffset = tagsKeyMatch[0].lastIndexOf("[");
            let arrDepth = 1;
            let j = k + bracketOpenOffset + 1;

            while (j < objStr.length && arrDepth > 0) {
              if (objStr[j] === "[") arrDepth++;
              else if (objStr[j] === "]") arrDepth--;
              if (arrDepth > 0) j++;
            }

            topLevelTagsEnd = j + 1;
            break;
          }
        }

        k++;
      }

      if (topLevelTagsStart !== -1) {
        // Tags already exists — add "mock-data" if missing
        const tagsStr = objStr.substring(topLevelTagsStart, topLevelTagsEnd);
        const bracketOpen = tagsStr.indexOf("[");
        const arrayContent = tagsStr.substring(
          bracketOpen + 1,
          tagsStr.lastIndexOf("]"),
        );
        const hasMockData =
          arrayContent.includes('"mock-data"') ||
          arrayContent.includes("'mock-data'");

        if (hasMockData) return objStr;

        const existingTags = arrayContent.trim();
        const newTags = existingTags
          ? `${existingTags}, "mock-data"`
          : `"mock-data"`;
        const newTagsStr = `Tags: [${newTags}]`;

        return (
          objStr.substring(0, topLevelTagsStart) +
          newTagsStr +
          objStr.substring(topLevelTagsEnd)
        );
      } else {
        // Tags doesn't exist — inject it inside the object before closing brace
        const openingBraceIndex = objStr.indexOf("{");
        const closingBraceIndex = objStr.lastIndexOf("}");

        if (
          openingBraceIndex === -1 ||
          closingBraceIndex === -1 ||
          openingBraceIndex > closingBraceIndex
        ) {
          return objStr;
        }

        const innerContent = objStr.substring(
          openingBraceIndex + 1,
          closingBraceIndex,
        );
        const hasFields = innerContent.trim().length > 0;
        const beforeClosing = objStr.substring(0, closingBraceIndex).trimEnd();
        const closingIndentMatch = beforeClosing.match(/(^|\n)([ \t]*)[^\n]*$/);
        const closingIndent = closingIndentMatch?.[2] ?? "  ";
        const fieldIndent = `${closingIndent}  `;
        const separator = hasFields ? "," : "";

        return `${beforeClosing}${separator}\n${fieldIndent}Tags: ["mock-data"]\n${closingIndent}}${objStr.substring(closingBraceIndex + 1)}`;
      }
    };

    let result: string;

    if (isArray) {
      // insertMany case: process each object in the array
      let arrayDepth = 0;
      let currentObjStart = -1;
      let processed = "";
      let i = 0;

      while (i < inputContent.length) {
        const ch = inputContent[i];

        if (ch === "{") {
          if (arrayDepth === 0) {
            currentObjStart = i;
          }
          arrayDepth++;
        } else if (ch === "}") {
          arrayDepth--;
          if (arrayDepth === 0 && currentObjStart !== -1) {
            const objStr = inputContent.substring(currentObjStart, i + 1);
            const processedObj = processSingleObject(objStr);
            processed += processedObj;
            currentObjStart = -1;
          } else if (arrayDepth === 0) {
            processed += ch;
          }
        } else {
          if (arrayDepth === 0) {
            processed += ch;
          }
        }

        i++;
      }

      result = `${queryText.substring(0, openCharIndex + 1)}${processed}${queryText.substring(pos)}`;
    } else {
      // Single insert case: process full object including braces
      const singleObject = queryText.substring(openCharIndex, pos + 1);
      const processedSingleObject = processSingleObject(singleObject);
      result = `${queryText.substring(0, openCharIndex)}${processedSingleObject}${queryText.substring(pos + 1)}`;
    }

    return result;
  }, []);

  // Execute a specific operation (used by CodeLens)
  const executeOperation = useCallback(
    async (operationText: string) => {
      try {
        // Inject mock-data tag for insert operations
        const modifiedQuery = injectMockDataTag(operationText);

        const data = await executeGraphQL({
          projectShortKey,
          query: modifiedQuery,
        });
        const responseContent = JSON.stringify(data, null, 2);

        // Create a single response tab - always use "Response" for single operations
        const newTab: ResponseTab = {
          id: `response-${Date.now()}`,
          name: "Response",
          content: responseContent,
        };

        setResponses([newTab]);
        setActiveResponseTab(newTab.id);
      } catch (error) {
        const errorContent = JSON.stringify({ error: String(error) }, null, 2);
        const newTab: ResponseTab = {
          id: `response-${Date.now()}`,
          name: "Response",
          content: errorContent,
        };

        setResponses([newTab]);
        setActiveResponseTab(newTab.id);
      }
    },
    [executeGraphQL, projectShortKey, injectMockDataTag],
  );

  // Register custom completion provider
  const handleEditorDidMount = (
    editorInstance: editor.IStandaloneCodeEditor,
    monaco: typeof import("monaco-editor"),
  ) => {
    editorRef.current = editorInstance;

    // Store monaco instance globally for later use
    (window as unknown as { monaco?: typeof import("monaco-editor") }).monaco =
      monaco;

    // Shift+Enter inserts a newline without accepting any active suggestion
    editorInstance.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () =>
      editorInstance.trigger("keyboard", "type", { text: "\n" }),
    );

    // Ctrl+Shift+E → Execute the current query
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE,
      () => {
        const executeBtn = document.getElementById("graphql-execute-btn");
        if (executeBtn) executeBtn.click();
      },
    );

    // Mark Monaco as ready
    setIsMonacoReady(true);
  };

  // Helper: convert IntrospectionSuggestion to Monaco CompletionItem
  const toMonacoItem = useCallback(
    (
      suggestion: IntrospectionSuggestion,
      monaco: typeof import("monaco-editor"),
      range: {
        startLineNumber: number;
        endLineNumber: number;
        startColumn: number;
        endColumn: number;
      },
    ): languages.CompletionItem => {
      const kindMap: Record<string, languages.CompletionItemKind> = {
        function: monaco.languages.CompletionItemKind.Function,
        field: monaco.languages.CompletionItemKind.Field,
        keyword: monaco.languages.CompletionItemKind.Keyword,
        variable: monaco.languages.CompletionItemKind.Variable,
        enum: monaco.languages.CompletionItemKind.Enum,
        class: monaco.languages.CompletionItemKind.Class,
      };

      return {
        label: suggestion.label,
        kind:
          kindMap[suggestion.kind] ?? monaco.languages.CompletionItemKind.Field,
        insertText: suggestion.insertText,
        insertTextRules: suggestion.isSnippet
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        documentation: suggestion.documentation,
        detail: suggestion.detail,
        sortText: suggestion.sortText,
        range,
      };
    },
    [],
  );

  // Re-register completion provider when schemas or introspection change
  useEffect(() => {
    if (!editorRef.current || !isMonacoReady) return;

    const monaco = (
      window as unknown as { monaco?: typeof import("monaco-editor") }
    ).monaco;
    if (!monaco || !monaco.languages) return;

    try {
      // Clean up previous provider
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
      }

      // Register completion provider
      completionDisposableRef.current =
        monaco.languages.registerCompletionItemProvider("graphql", {
          triggerCharacters: ["{", "(", " ", "\n"],
          provideCompletionItems: (
            model: editor.ITextModel,
            position: Position,
          ): languages.ProviderResult<languages.CompletionList> => {
            const fullText = model.getValue();
            const offset = model.getOffsetAt(position);
            const textBeforeCursor = fullText.substring(0, offset);

            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };

            const suggestions: languages.CompletionItem[] = [];

            // ── Introspection-based completions (preferred) ──────────────
            if (introspectedSchema) {
              const operationCtx = detectOperationContext(textBeforeCursor);

              // Robust depth counting for both braces and parentheses
              let braceDepth = 0;
              let parenDepth = 0;
              for (const char of textBeforeCursor) {
                if (char === "{") braceDepth++;
                else if (char === "}") braceDepth--;
                if (char === "(") parenDepth++;
                else if (char === ")") parenDepth--;
              }

              // At the top level (depth 0) — suggest query/mutation keywords
              if (braceDepth === 0) {
                // Generic keyword fallbacks (always shown)
                suggestions.push(
                  {
                    label: "query",
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: "query {\n  $0\n}",
                    insertTextRules:
                      monaco.languages.CompletionItemInsertTextRule
                        .InsertAsSnippet,
                    documentation: "GraphQL query block",
                    detail: "Query keyword",
                    sortText: "9_query",
                    range,
                  },
                  {
                    label: "mutation",
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: "mutation {\n  $0\n}",
                    insertTextRules:
                      monaco.languages.CompletionItemInsertTextRule
                        .InsertAsSnippet,
                    documentation: "GraphQL mutation block",
                    detail: "Mutation keyword",
                    sortText: "9_mutation",
                    range,
                  },
                );

                // Full per-operation snippets (preferred — listed first via sortText)
                getFullQuerySnippets(introspectedSchema).forEach((s) => {
                  suggestions.push(toMonacoItem(s, monaco, range));
                });
                getFullMutationSnippets(introspectedSchema).forEach((s) => {
                  suggestions.push(toMonacoItem(s, monaco, range));
                });
              }

              // Depth 1 inside query/mutation — suggest operations
              if (braceDepth === 1 && operationCtx) {
                // Suggest operation names (getInventoryItems, etc.)
                const opSuggestions =
                  operationCtx === "query"
                    ? getQuerySuggestions(introspectedSchema)
                    : getMutationSuggestions(introspectedSchema);

                opSuggestions.forEach((s) => {
                  suggestions.push(toMonacoItem(s, monaco, range));
                });

                // Also suggest arguments when cursor is inside parentheses of an operation
                if (parenDepth > 0) {
                  const matches = Array.from(
                    textBeforeCursor.matchAll(/(\w+)\s*\(/g),
                  );
                  const opMatch = matches.pop()?.[1];

                  if (opMatch && operationCtx) {
                    const parentTypeName =
                      operationCtx === "query" ? "Query" : "Mutation";
                    const argSuggestions = getArgumentSuggestions(
                      opMatch,
                      parentTypeName as any,
                      introspectedSchema,
                    );
                    argSuggestions.forEach((s: IntrospectionSuggestion) => {
                      suggestions.push(toMonacoItem(s, monaco, range));
                    });
                  }
                }
              }

              // Depth >= 2 — inside a field selection or input block
              if (braceDepth >= 2) {
                const blockPath = resolveInputBlockPath(textBeforeCursor);
                const operationFieldName =
                  detectCurrentFieldName(textBeforeCursor);
                const resolvedInputType =
                  operationCtx && operationFieldName
                    ? resolveInputObjectTypeAtCursor({
                        schema: introspectedSchema,
                        operationContext: operationCtx,
                        operationFieldName,
                        blockPath,
                      })
                    : null;

                if (resolvedInputType) {
                  const inputSuggestions = getInputFieldSuggestions(
                    resolvedInputType.name,
                    introspectedSchema,
                  );
                  inputSuggestions.forEach((s) => {
                    suggestions.push(toMonacoItem(s, monaco, range));
                  });
                } else {
                  // Inside a field selection set — try to detect the return type
                  // Look for items { pattern or the parent operation
                  const textForMatching = textBeforeCursor.replace(/\n/g, " ");

                  // Check if inside items { } block
                  const lastItemsIdx = textBeforeCursor.lastIndexOf("items");
                  let isInsideItems = false;

                  if (lastItemsIdx !== -1) {
                    const afterItems = textBeforeCursor.substring(lastItemsIdx);
                    const openBrace = afterItems.indexOf("{");
                    if (openBrace !== -1) {
                      let depth = 1;
                      const afterBrace = textBeforeCursor.substring(
                        lastItemsIdx + openBrace + 1,
                      );
                      for (const char of afterBrace) {
                        if (char === "{") depth++;
                        else if (char === "}") depth--;
                        if (depth === 0) break;
                      }
                      isInsideItems = depth > 0;
                    }
                  }

                  // Detect the parent operation to find its return type
                  const opMatch = textForMatching.match(/(\w+)\s*\(/)?.[1];

                  if (opMatch && operationCtx) {
                    const parentType =
                      operationCtx === "query"
                        ? introspectedSchema.getQueryType()
                        : introspectedSchema.getMutationType();

                    if (parentType) {
                      const field = parentType.getFields()[opMatch];
                      if (field) {
                        let returnType = field.type;
                        // Unwrap NonNull/List
                        while (
                          isNonNullType(returnType) ||
                          isListType(returnType)
                        ) {
                          returnType = (returnType as any).ofType;
                        }

                        if (isObjectType(returnType)) {
                          if (isInsideItems) {
                            // Inside items — suggest fields of the "items" sub-type
                            const itemsField = returnType.getFields()["items"];
                            if (itemsField) {
                              let itemType = itemsField.type;
                              while (
                                isNonNullType(itemType) ||
                                isListType(itemType)
                              ) {
                                itemType = (itemType as any).ofType;
                              }
                              if (isObjectType(itemType)) {
                                const fieldSuggestions = getFieldSuggestions(
                                  (itemType as any).name,
                                  introspectedSchema,
                                );
                                fieldSuggestions.forEach((s) => {
                                  suggestions.push(
                                    toMonacoItem(s, monaco, range),
                                  );
                                });
                              }
                            }
                          } else {
                            // Directly inside the operation return type
                            const fieldSuggestions = getFieldSuggestions(
                              (returnType as any).name,
                              introspectedSchema,
                              { omitPaginationMirrorFields: true },
                            );
                            fieldSuggestions.forEach((s) => {
                              suggestions.push(toMonacoItem(s, monaco, range));
                            });
                          }
                        }
                      }
                    }
                  }
                }
              }

              // If we got introspection suggestions, return them
              if (suggestions.length > 0) {
                return { suggestions };
              }
            }

            // ── Fallback: schema-list-based completions ─────────────────
            // Used when introspection is not available (e.g. gateway pod not running)

            // Detect if we're inside an input block or items block by analyzing brace nesting
            const lastInputIndex = textBeforeCursor.lastIndexOf("input: {");

            let isInsideInputBlock = false;
            let isInsideItemsBlock = false;

            // Check input block
            if (lastInputIndex !== -1) {
              const textAfterInput = textBeforeCursor.substring(
                lastInputIndex + 8,
              );
              let braceDepth = 1;

              for (const char of textAfterInput) {
                if (char === "{") braceDepth++;
                else if (char === "}") braceDepth--;
                if (braceDepth === 0) {
                  isInsideInputBlock = false;
                  break;
                }
              }

              if (braceDepth > 0) {
                isInsideInputBlock = true;
              }
            }

            // Check items block
            const itemsPattern = textBeforeCursor.lastIndexOf("items");
            if (itemsPattern !== -1) {
              const afterItems = textBeforeCursor.substring(itemsPattern);
              const openBraceIndex = afterItems.indexOf("{");

              if (openBraceIndex !== -1) {
                const textAfterOpenBrace = textBeforeCursor.substring(
                  itemsPattern + openBraceIndex + 1,
                );
                let braceDepth = 1;

                for (const char of textAfterOpenBrace) {
                  if (char === "{") braceDepth++;
                  else if (char === "}") braceDepth--;
                  if (braceDepth === 0) {
                    isInsideItemsBlock = false;
                    break;
                  }
                }

                if (braceDepth > 0) {
                  isInsideItemsBlock = true;
                }
              }
            }

            // Try to detect which schema we're working with
            let currentSchemaName: string | null = null;
            const textForMatching = textBeforeCursor.replace(/\n/g, " ");

            const insertMatch = textForMatching.match(/insert(\w+)\s*\(/);
            const updateMatch = textForMatching.match(/update(\w+)\s*\(/);
            const getMatches = textForMatching.matchAll(/get(\w+?)s?\s*\(/g);
            const getMatchesArray = Array.from(getMatches);
            const getMatch =
              getMatchesArray.length > 0
                ? getMatchesArray[getMatchesArray.length - 1]
                : null;

            if (insertMatch) {
              currentSchemaName = insertMatch[1];
            } else if (updateMatch) {
              currentSchemaName = updateMatch[1];
            } else if (getMatch) {
              currentSchemaName = getMatch[1];
            }

            // Helper to recursively format nested DTO fields
            const formatNestedDtoInsert = (
              obj: Record<string, unknown>,
            ): string => {
              const lines: string[] = [];

              Object.entries(obj).forEach(([key, value], index) => {
                if (
                  Array.isArray(value) &&
                  value.length > 0 &&
                  typeof value[0] === "object"
                ) {
                  lines.push(`${key}: [{`);
                  const nestedLines = formatNestedDtoInsert(
                    value[0] as Record<string, unknown>,
                  );
                  if (nestedLines) {
                    nestedLines.split("\n").forEach((line) => {
                      lines.push(`\t${line}`);
                    });
                  }
                  lines.push(`}]`);
                } else if (
                  typeof value === "object" &&
                  value !== null &&
                  !Array.isArray(value)
                ) {
                  lines.push(`${key}: {`);
                  const nestedLines = formatNestedDtoInsert(
                    value as Record<string, unknown>,
                  );
                  if (nestedLines) {
                    nestedLines.split("\n").forEach((line) => {
                      lines.push(`\t${line}`);
                    });
                  }
                  lines.push(`}`);
                } else {
                  lines.push(`${key}: \${${index + 1}}`);
                }
              });

              return lines.join("\n");
            };

            const formatNestedDtoSelection = (
              obj: Record<string, unknown>,
            ): string => {
              const lines: string[] = [];

              Object.entries(obj).forEach(([key, value]) => {
                if (
                  Array.isArray(value) &&
                  value.length > 0 &&
                  typeof value[0] === "object"
                ) {
                  lines.push(`${key} {`);
                  const nestedLines = formatNestedDtoSelection(
                    value[0] as Record<string, unknown>,
                  );
                  if (nestedLines) {
                    nestedLines.split("\n").forEach((line) => {
                      lines.push(`\t${line}`);
                    });
                  }
                  lines.push(`}`);
                } else if (
                  typeof value === "object" &&
                  value !== null &&
                  !Array.isArray(value)
                ) {
                  lines.push(`${key} {`);
                  const nestedLines = formatNestedDtoSelection(
                    value as Record<string, unknown>,
                  );
                  if (nestedLines) {
                    nestedLines.split("\n").forEach((line) => {
                      lines.push(`\t${line}`);
                    });
                  }
                  lines.push(`}`);
                } else {
                  lines.push(`${key}`);
                }
              });

              return lines.join("\n");
            };

            // Suggest fields for input blocks (mutations) or items blocks (queries)
            if (
              (isInsideInputBlock || isInsideItemsBlock) &&
              currentSchemaName
            ) {
              const currentSchema = schemas.find(
                (s) => s.schemaName === currentSchemaName,
              );

              if (currentSchema && currentSchema.fields) {
                currentSchema.fields.forEach((field) => {
                  const fieldTypeName = field.type?.trim();
                  const isDto =
                    fieldTypeName && dtoPreviewMap.has(fieldTypeName);

                  let insertText: string;
                  let insertTextRules:
                    | languages.CompletionItemInsertTextRule
                    | undefined;

                  if (isDto) {
                    const nestedStructure = dtoPreviewMap.get(fieldTypeName);
                    if (nestedStructure) {
                      if (isInsideInputBlock) {
                        if (field.isArray) {
                          insertText = `${field.name}: [{\n${formatNestedDtoInsert(nestedStructure)}\n}]`;
                        } else {
                          insertText = `${field.name}: {\n${formatNestedDtoInsert(nestedStructure)}\n}`;
                        }
                        insertTextRules =
                          monaco.languages.CompletionItemInsertTextRule
                            .InsertAsSnippet;
                      } else {
                        insertText = `${field.name} {\n${formatNestedDtoSelection(nestedStructure)}\n}`;
                        insertTextRules =
                          monaco.languages.CompletionItemInsertTextRule
                            .InsertAsSnippet;
                      }
                    } else {
                      insertText = isInsideInputBlock
                        ? `${field.name}: \${1}`
                        : field.name;
                      insertTextRules = isInsideInputBlock
                        ? monaco.languages.CompletionItemInsertTextRule
                            .InsertAsSnippet
                        : undefined;
                    }
                  } else {
                    insertText = isInsideInputBlock
                      ? `${field.name}: \${1}`
                      : field.name;
                    insertTextRules = isInsideInputBlock
                      ? monaco.languages.CompletionItemInsertTextRule
                          .InsertAsSnippet
                      : undefined;
                  }

                  suggestions.push({
                    label: field.name,
                    kind: isDto
                      ? monaco.languages.CompletionItemKind.Class
                      : monaco.languages.CompletionItemKind.Field,
                    insertText,
                    insertTextRules,
                    documentation: `${field.type}${field.isArray ? "[]" : ""}${isDto ? " (nested DTO)" : ""}`,
                    detail: isDto
                      ? `DTO: ${field.type}`
                      : `Field: ${field.type}`,
                    sortText: `0_${field.name}`,
                    range,
                  });
                });

                return { suggestions };
              }
            }

            // Add basic GraphQL keywords
            suggestions.push(
              {
                label: "query",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: "query {\n  $0\n}",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "GraphQL query block",
                detail: "Query keyword",
                range,
              },
              {
                label: "mutation",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: "mutation {\n  $0\n}",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: "GraphQL mutation block",
                detail: "Mutation keyword",
                range,
              },
            );

            // Add dynamic schema-based completions
            schemas.forEach((schema) => {
              const schemaName = schema.schemaName;
              const fields = generateFieldSnippet(schema);

              suggestions.push({
                label: `get${schemaName}s`,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: `get${schemaName}s(
  input: {
    filter: "{}" # stringify mongo filter
    sort: "{}" # stringify mongo sorting
    pageNo: 1
    pageSize: 10
  }
) {
  totalCount
  totalPages
  hasNextPage
  hasPreviousPage
  items {
    ${fields}
  }
}`,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: `Query ${schemaName} entities with pagination`,
                detail: `Query: ${schemaName}`,
                sortText: `0_get${schemaName}s`,
                range,
              });

              suggestions.push({
                label: `insert${schemaName}`,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: `insert${schemaName}(
  input: {
    \${1}
  }
) {
  acknowledged
  totalImpactedData
  itemId
}`,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: `Insert new ${schemaName} entry`,
                detail: `Mutation: ${schemaName}`,
                sortText: `0_insert${schemaName}`,
                range,
              });

              suggestions.push({
                label: `update${schemaName}`,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: `update${schemaName}(
  filter: "{}" # stringify mongo filter
  input: {
    \${1}
  }
) {
  acknowledged
  totalImpactedData
  itemId
}`,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: `Update ${schemaName} entry`,
                detail: `Mutation: ${schemaName}`,
                sortText: `0_update${schemaName}`,
                range,
              });

              suggestions.push({
                label: `delete${schemaName}`,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: `delete${schemaName}(
  filter: "{}" # stringify mongo filter
) {
  acknowledged
  totalImpactedData
  itemId
}`,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: `Delete ${schemaName} entry`,
                detail: `Mutation: ${schemaName}`,
                sortText: `0_delete${schemaName}`,
                range,
              });
            });

            return { suggestions };
          },
        });
    } catch (error) {
      console.error("Error registering completion provider:", error);
    }
  }, [
    schemas,
    generateFieldSnippet,
    isMonacoReady,
    dtoPreviewMap,
    introspectedSchema,
    toMonacoItem,
  ]);

  // Register CodeLens provider for individual operation execution
  useEffect(() => {
    if (!editorRef.current || !isMonacoReady) return;

    const monaco = (
      window as unknown as { monaco?: typeof import("monaco-editor") }
    ).monaco;
    if (!monaco || !monaco.languages) return;

    try {
      // Clean up previous provider
      if (codeLensDisposableRef.current) {
        codeLensDisposableRef.current.dispose();
      }

      // Store operation map globally for command handler
      const operationMap = new Map<string, string>();

      // Register CodeLens provider
      codeLensDisposableRef.current = monaco.languages.registerCodeLensProvider(
        "graphql",
        {
          provideCodeLenses: (model) => {
            const text = model.getValue();
            const operations = parseOperations(text);

            const lenses = operations.map((op, index) => {
              const commandId = `run-graphql-operation-${index}`;

              operationMap.set(commandId, op.text);

              return {
                range: {
                  startLineNumber: op.startLine,
                  startColumn: 1,
                  endLineNumber: op.startLine,
                  endColumn: 1,
                },
                command: {
                  id: commandId,
                  title: `▶ Run ${op.type}${op.name !== "Unnamed" ? ` "${op.name}"` : ""}`,
                },
              };
            });

            return { lenses, dispose: () => {} };
          },
          resolveCodeLens: (_model, codeLens) => codeLens,
        },
      );

      // Register global command handler
      const editorInstance = editorRef.current;
      const onDidExecuteCommand = editorInstance.onDidChangeModelContent(() => {
        // Trigger CodeLens refresh when content changes
        if (monaco.editor) {
          monaco.editor.setModelMarkers(
            editorInstance.getModel()!,
            "graphql",
            [],
          );
        }
      });

      // Listen for CodeLens clicks
      const commandService = (
        editorInstance as unknown as {
          _commandService?: {
            executeCommand: (commandId: string, ...args: unknown[]) => unknown;
          };
        }
      )._commandService;

      if (commandService) {
        const originalExecuteCommand =
          commandService.executeCommand.bind(commandService);
        commandService.executeCommand = function (
          commandId: string,
          ...args: unknown[]
        ) {
          // Check if this is our GraphQL operation command
          if (commandId.startsWith("run-graphql-operation-")) {
            const operationText = operationMap.get(commandId);
            if (operationText) {
              executeOperation(operationText);
              return Promise.resolve();
            }
          }

          // Otherwise, execute the original command
          return originalExecuteCommand(commandId, ...args);
        };
      }

      return () => {
        onDidExecuteCommand?.dispose();
      };
    } catch (error) {
      console.error("Error registering CodeLens provider:", error);
    }
  }, [isMonacoReady, parseOperations, executeOperation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
      }
      if (codeLensDisposableRef.current) {
        codeLensDisposableRef.current.dispose();
      }
    };
  }, []);

  const handleExecuteQuery = async () => {
    // Parse all operations in the editor
    const operations = parseOperations(query);

    // If no operations found, try to execute the entire query as-is
    if (operations.length === 0) {
      try {
        // Inject mock-data tag for insert operations
        const modifiedQuery = injectMockDataTag(query);

        const data = await executeGraphQL({
          projectShortKey,
          query: modifiedQuery,
        });
        const newTab: ResponseTab = {
          id: `response-${Date.now()}`,
          name: "Response",
          content: JSON.stringify(data, null, 2),
        };
        setResponses([newTab]);
        setActiveResponseTab(newTab.id);
      } catch (error) {
        const newTab: ResponseTab = {
          id: `response-${Date.now()}`,
          name: "Error",
          content: JSON.stringify({ error: String(error) }, null, 2),
        };
        setResponses([newTab]);
        setActiveResponseTab(newTab.id);
      }
      return;
    }

    // Execute all operations one by one
    const newResponses: ResponseTab[] = [];
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];

      try {
        // Inject mock-data tag for insert operations
        const modifiedQuery = injectMockDataTag(operation.text);

        const data = await executeGraphQL({
          projectShortKey,
          query: modifiedQuery,
        });

        newResponses.push({
          id: `response-${i}`,
          name: operations.length === 1 ? "Response" : `Response ${i + 1}`,
          content: JSON.stringify(data, null, 2),
        });
      } catch (error) {
        newResponses.push({
          id: `response-${i}`,
          name: operations.length === 1 ? "Response" : `Response ${i + 1}`,
          content: JSON.stringify({ error: String(error) }, null, 2),
        });
      }
    }

    setResponses(newResponses);
    // Set active tab to the first response
    if (newResponses.length > 0) {
      setActiveResponseTab(newResponses[0].id);
    }
  };

  return (
    <>
      <div className="flex h-full w-full flex-col">
        {/* Top Header with Clean Test Data Button */}
        <div className="flex h-12 items-center justify-between border-b bg-muted px-4">
          <h2 className="text-lg font-semibold">GraphQL Playground</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleFetchSchemas}
              disabled={!projectShortKey || isSchemasDrawerLoading}
              className="gap-2"
            >
              <BookOpen className="h-4 w-4" />
              Schemas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCleanDataModalOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clean Test Data
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          {/* Query Editor */}
          <div className="flex w-full flex-col border-r md:w-1/2">
            <div className="flex h-12 items-center justify-between border-b bg-muted px-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Query Editor</span>
                <div className="group relative">
                  <Keyboard className="h-4 w-4 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                  <div className="absolute left-0 top-full z-50 mt-2 hidden w-64 rounded-md border bg-popover p-3 text-xs shadow-md group-hover:block">
                    <p className="mb-2 font-semibold text-foreground">
                      Keyboard Shortcuts
                    </p>
                    <div className="space-y-1.5 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Execute query</span>
                        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          Ctrl+Shift+E
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>New line</span>
                        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          Shift+Enter
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Navigate fields</span>
                        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          Tab
                        </kbd>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <Button
                id="graphql-execute-btn"
                size="sm"
                onClick={handleExecuteQuery}
                disabled={isLoading}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                {isLoading ? "Executing..." : "Execute"}
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <GraphqlMonacoEditor
                height="100%"
                language="graphql"
                theme={monacoTheme}
                value={query}
                onChange={(value) => setQuery(value || "")}
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: "on",
                  folding: true,
                  formatOnPaste: true,
                  formatOnType: true,
                  codeLens: true,
                }}
              />
            </div>
          </div>

          {/* Response Viewer */}
          <div className="flex w-full flex-col md:w-1/2">
            {responses.length === 0 ? (
              <>
                <div className="flex h-12 items-center border-b bg-muted px-4">
                  <span className="text-sm font-medium">Response</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <GraphqlMonacoEditor
                    height="100%"
                    language="json"
                    theme={monacoTheme}
                    value="// Execute a query to see the response"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                      wordWrap: "on",
                      folding: true,
                    }}
                  />
                </div>
              </>
            ) : responses.length === 1 ? (
              <>
                <div className="flex h-12 items-center border-b bg-muted px-4">
                  <span className="text-sm font-medium">
                    {responses[0].name}
                  </span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <GraphqlMonacoEditor
                    height="100%"
                    language="json"
                    theme={monacoTheme}
                    value={responses[0].content}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                      wordWrap: "on",
                      folding: true,
                    }}
                  />
                </div>
              </>
            ) : (
              <Tabs
                value={activeResponseTab}
                onValueChange={setActiveResponseTab}
                className="flex h-full flex-col"
              >
                <div className="flex h-12 items-center border-b bg-muted px-4">
                  <TabsList className="h-9 bg-transparent p-0">
                    {responses.map((response) => (
                      <TabsTrigger
                        key={response.id}
                        value={response.id}
                        className="px-3 text-xs data-[state=active]:bg-background"
                      >
                        {response.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {responses.map((response) => (
                  <TabsContent
                    key={response.id}
                    value={response.id}
                    className="mt-0 flex-1 overflow-hidden"
                  >
                    <GraphqlMonacoEditor
                      height="100%"
                      language="json"
                      theme={monacoTheme}
                      value={response.content}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                        wordWrap: "on",
                        folding: true,
                      }}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        </div>
      </div>

      {/* Clean Test Data Modal */}
      <CleanTestDataModal
        open={isCleanDataModalOpen}
        onOpenChange={setIsCleanDataModalOpen}
      />

      {/* Schemas Introspection Drawer */}
      <SchemasDrawer
        open={isSchemasDrawerOpen}
        onOpenChange={setIsSchemasDrawerOpen}
        data={schemasIntrospectionData}
        isLoading={isSchemasDrawerLoading}
        onUseQuery={handleUseQueryFromSchemas}
      />
    </>
  );
};
