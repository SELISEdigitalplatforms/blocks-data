"use client";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui-kits/drawer/drawer";
import { Input } from "@/components/ui-kits/input/input";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { cn } from "@/lib/utils";
import {
  type FieldArg,
  generateGraphQLQuery,
  type IntrospectionResponse,
  type IntrospectionType,
  resolveBaseTypeName,
  resolveTypeName,
  type SchemaField,
} from "@/cross-modules/data-gateway/utils/generate-preview-queries";
import { Check, ChevronDown, ChevronRight, FilePenLine, Loader, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

interface CategorizedSchema {
  queries: SchemaField[];
  mutations: SchemaField[];
  objectTypes: IntrospectionType[];
  resultTypes: IntrospectionType[];
  inputTypes: IntrospectionType[];
  scalars: IntrospectionType[];
  enums: IntrospectionType[];
}

interface SchemasDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: unknown;
  isLoading: boolean;
  onUseQuery?: (query: string) => void;
}

function isExpandableType(
  typeName: string | null,
  typeMap: Map<string, IntrospectionType>,
): boolean {
  if (!typeName) return false;
  const type = typeMap.get(typeName);
  if (!type) return false;
  return type.kind === "OBJECT" || type.kind === "INPUT_OBJECT" || type.kind === "ENUM";
}

function categorizeTypes(response: IntrospectionResponse): CategorizedSchema {
  const schema = response.data.__schema;
  const types = schema.types.filter((t) => !t.name.startsWith("__"));

  const queryTypeName = schema.queryType?.name;
  const mutationTypeName = schema.mutationType?.name;

  const queryType = types.find((t) => t.name === queryTypeName);
  const mutationType = types.find((t) => t.name === mutationTypeName);

  const rootNames = new Set([queryTypeName, mutationTypeName].filter(Boolean));
  const resultSuffixes = ["Result", "Response"];

  const result: CategorizedSchema = {
    queries: queryType?.fields ?? [],
    mutations: mutationType?.fields ?? [],
    objectTypes: [],
    resultTypes: [],
    inputTypes: [],
    scalars: [],
    enums: [],
  };

  for (const type of types) {
    if (rootNames.has(type.name)) continue;

    switch (type.kind) {
      case "OBJECT": {
        const isResult = resultSuffixes.some((s) => type.name.endsWith(s));
        if (isResult) {
          result.resultTypes.push(type);
        } else {
          result.objectTypes.push(type);
        }
        break;
      }
      case "INPUT_OBJECT":
        result.inputTypes.push(type);
        break;
      case "SCALAR":
        result.scalars.push(type);
        break;
      case "ENUM":
        result.enums.push(type);
        break;
    }
  }

  return result;
}

function formatArgs(args: FieldArg[]): string {
  if (!args.length) return "";
  const parts = args.map((a) => `${a.name}: ${resolveTypeName(a.type)}`);
  return `(${parts.join(", ")})`;
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </span>
      </button>
      {isOpen && <div className="pb-2">{children}</div>}
    </div>
  );
}

const MAX_NESTING_DEPTH = 6;

function InlineTypeFields({
  typeName,
  typeMap,
  depth = 0,
}: {
  typeName: string | null;
  typeMap: Map<string, IntrospectionType>;
  depth?: number;
}) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  if (!typeName) return null;
  if (depth >= MAX_NESTING_DEPTH) {
    return <span className="pl-3 text-xs text-muted-foreground">...</span>;
  }

  const type = typeMap.get(typeName);
  if (!type) return null;

  const fields = type.fields ?? [];
  const inputFields = type.inputFields ?? [];
  const enumValues = type.enumValues ?? [];

  if (fields.length === 0 && inputFields.length === 0 && enumValues.length === 0) return null;

  const toggleField = (fieldName: string) => {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  };

  return (
    <div className="mt-1 space-y-0.5 border-l border-border/40 pl-3">
      {fields.map((field) => {
        const baseName = resolveBaseTypeName(field.type);
        const canExpand = isExpandableType(baseName, typeMap);
        const isFieldExpanded = expandedFields.has(field.name);

        return (
          <div key={field.name}>
            <div className="flex items-baseline gap-1.5 text-xs">
              {canExpand ? (
                <button
                  type="button"
                  onClick={() => toggleField(field.name)}
                  className="inline-flex shrink-0 items-center text-muted-foreground hover:text-foreground"
                >
                  {isFieldExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <code className={cn("font-medium", field.isDeprecated && "line-through opacity-60")}>
                {field.name}
              </code>
              <span className="text-muted-foreground">:</span>
              <span className="text-blue-600 dark:text-blue-400">
                {resolveTypeName(field.type)}
              </span>
            </div>
            {isFieldExpanded && canExpand && (
              <div className="ml-3">
                <InlineTypeFields typeName={baseName} typeMap={typeMap} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
      {inputFields.map((field) => {
        const baseName = resolveBaseTypeName(field.type);
        const canExpand = isExpandableType(baseName, typeMap);
        const isFieldExpanded = expandedFields.has(field.name);

        return (
          <div key={field.name}>
            <div className="flex items-baseline gap-1.5 text-xs">
              {canExpand ? (
                <button
                  type="button"
                  onClick={() => toggleField(field.name)}
                  className="inline-flex shrink-0 items-center text-muted-foreground hover:text-foreground"
                >
                  {isFieldExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <code className="font-medium">{field.name}</code>
              <span className="text-muted-foreground">:</span>
              <span className="text-blue-600 dark:text-blue-400">
                {resolveTypeName(field.type)}
              </span>
              {field.defaultValue && (
                <span className="text-muted-foreground">= {field.defaultValue}</span>
              )}
            </div>
            {isFieldExpanded && canExpand && (
              <div className="ml-3">
                <InlineTypeFields typeName={baseName} typeMap={typeMap} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
      {enumValues.map((ev) => (
        <div key={ev.name} className="flex items-baseline gap-1.5 text-xs">
          <span className="w-3 shrink-0" />
          <code className={cn("font-medium", ev.isDeprecated && "line-through opacity-60")}>
            {ev.name}
          </code>
          {ev.description && <span className="text-muted-foreground">- {ev.description}</span>}
        </div>
      ))}
    </div>
  );
}

function ExpandableType({
  type,
  typeMap,
}: {
  type: IntrospectionType;
  typeMap: Map<string, IntrospectionType>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const fields = type.fields ?? [];
  const inputFields = type.inputFields ?? [];
  const enumValues = type.enumValues ?? [];
  const allFields = [...fields, ...inputFields];

  return (
    <div className="mx-4 mb-1.5 rounded-lg border border-border/40 bg-background">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        {allFields.length > 0 || enumValues.length > 0 ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <code className="text-sm font-medium">{type.name}</code>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {type.kind}
        </span>
      </button>
      {isExpanded && (
        <div className="border-t border-border/30 px-3 py-2">
          {type.description && (
            <p className="mb-2 text-xs text-muted-foreground">{type.description}</p>
          )}
          <InlineTypeFields typeName={type.name} typeMap={typeMap} depth={0} />
        </div>
      )}
    </div>
  );
}

function OperationField({
  field,
  typeMap,
  operationType,
  onUseQuery,
}: {
  field: SchemaField;
  typeMap: Map<string, IntrospectionType>;
  operationType: "query" | "mutation";
  onUseQuery?: (query: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const returnBaseName = resolveBaseTypeName(field.type);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCopied) return;
    const queryStr = generateGraphQLQuery(field, typeMap, operationType);
    onUseQuery?.(queryStr);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="mx-4 mb-1.5 rounded-lg border border-border/40 bg-background">
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
        >
          {isExpanded ? (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-wrap items-baseline gap-1 text-xs">
            <code className="text-sm font-medium">{field.name}</code>
            {field.args.length > 0 && (
              <span className="text-muted-foreground">{formatArgs(field.args)}</span>
            )}
            <span className="text-muted-foreground">:</span>
            <span className="text-blue-600 dark:text-blue-400">{resolveTypeName(field.type)}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "shrink-0 rounded-md px-2 py-1.5 transition-all",
            isCopied
              ? "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
          title="Use in Query Editor"
        >
          {isCopied ? (
            <span className="flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Done!</span>
            </span>
          ) : (
            <FilePenLine className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {isExpanded && (
        <div className="space-y-3 border-t border-border/30 px-3 py-2">
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
          {field.args.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Arguments
              </p>
              <div className="space-y-0.5">
                {field.args.map((arg) => {
                  const argBaseName = resolveBaseTypeName(arg.type);
                  return (
                    <div key={arg.name}>
                      <div className="flex items-baseline gap-1.5 pl-2 text-xs">
                        <code className="font-medium">{arg.name}</code>
                        <span className="text-muted-foreground">:</span>
                        <span className="text-blue-600 dark:text-blue-400">
                          {resolveTypeName(arg.type)}
                        </span>
                        {arg.defaultValue && (
                          <span className="text-muted-foreground">= {arg.defaultValue}</span>
                        )}
                      </div>
                      {isExpandableType(argBaseName, typeMap) && (
                        <div className="pl-2">
                          <InlineTypeFields typeName={argBaseName} typeMap={typeMap} depth={0} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {returnBaseName && isExpandableType(returnBaseName, typeMap) && (
            <div>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Returns:
                </span>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {resolveTypeName(field.type)}
                </span>
              </div>
              <InlineTypeFields typeName={returnBaseName} typeMap={typeMap} depth={0} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SchemasDrawer({
  open,
  onOpenChange,
  data,
  isLoading,
  onUseQuery,
}: SchemasDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const typeMap = useMemo(() => {
    if (!data) return new Map<string, IntrospectionType>();
    try {
      const schema = (data as IntrospectionResponse).data.__schema;
      const map = new Map<string, IntrospectionType>();
      for (const t of schema.types) {
        if (!t.name.startsWith("__")) map.set(t.name, t);
      }
      return map;
    } catch {
      return new Map<string, IntrospectionType>();
    }
  }, [data]);

  const categorized = useMemo(() => {
    if (!data) return null;
    try {
      return categorizeTypes(data as IntrospectionResponse);
    } catch {
      return null;
    }
  }, [data]);

  const filtered = useMemo(() => {
    if (!categorized) return null;
    const q = searchQuery.toLowerCase();
    if (!q) return categorized;

    return {
      queries: categorized.queries.filter(
        (f) =>
          f.name.toLowerCase().includes(q) || resolveTypeName(f.type).toLowerCase().includes(q),
      ),
      mutations: categorized.mutations.filter(
        (f) =>
          f.name.toLowerCase().includes(q) || resolveTypeName(f.type).toLowerCase().includes(q),
      ),
      objectTypes: categorized.objectTypes.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.fields?.some((f) => f.name.toLowerCase().includes(q)),
      ),
      resultTypes: categorized.resultTypes.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.fields?.some((f) => f.name.toLowerCase().includes(q)),
      ),
      inputTypes: categorized.inputTypes.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.inputFields?.some((f) => f.name.toLowerCase().includes(q)),
      ),
      scalars: categorized.scalars.filter((t) => t.name.toLowerCase().includes(q)),
      enums: categorized.enums.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.enumValues?.some((ev) => ev.name.toLowerCase().includes(q)),
      ),
    };
  }, [categorized, searchQuery]);

  return (
    <Drawer
      direction="right"
      handleOnly
      modal={false}
      shouldScaleBackground={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent
        onInteractOutside={() => onOpenChange(false)}
        className={cn(
          "inset-y-0 left-auto right-0 mt-0 h-full w-full rounded-none border-l bg-background md:w-[50vw] md:max-w-2xl [&>div:first-child]:hidden",
          "transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        )}
        style={{ userSelect: "text" }}
      >
        <div className="flex h-full flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
            <DrawerTitle className="text-lg font-semibold leading-none tracking-tight">
              Schemas
            </DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                aria-label="Close schemas drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>

          {/* Search */}
          <div className="border-b px-6 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search types, fields..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-sm"
              />
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !filtered ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No schema data available
              </div>
            ) : (
              <div className="py-2">
                <CollapsibleSection title="Queries" count={filtered.queries.length}>
                  {filtered.queries.map((field) => (
                    <OperationField
                      key={field.name}
                      field={field}
                      typeMap={typeMap}
                      operationType="query"
                      onUseQuery={onUseQuery}
                    />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Mutations" count={filtered.mutations.length}>
                  {filtered.mutations.map((field) => (
                    <OperationField
                      key={field.name}
                      field={field}
                      typeMap={typeMap}
                      operationType="mutation"
                      onUseQuery={onUseQuery}
                    />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Types" count={filtered.objectTypes.length}>
                  {filtered.objectTypes.map((type) => (
                    <ExpandableType key={type.name} type={type} typeMap={typeMap} />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Result Types" count={filtered.resultTypes.length}>
                  {filtered.resultTypes.map((type) => (
                    <ExpandableType key={type.name} type={type} typeMap={typeMap} />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Input Types" count={filtered.inputTypes.length}>
                  {filtered.inputTypes.map((type) => (
                    <ExpandableType key={type.name} type={type} typeMap={typeMap} />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Enums" count={filtered.enums.length} defaultOpen={false}>
                  {filtered.enums.map((type) => (
                    <ExpandableType key={type.name} type={type} typeMap={typeMap} />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Scalars"
                  count={filtered.scalars.length}
                  defaultOpen={false}
                >
                  {filtered.scalars.map((type) => (
                    <div
                      key={type.name}
                      className="mx-4 mb-1.5 flex items-baseline gap-2 rounded-lg border border-border/40 bg-background px-3 py-2"
                    >
                      <code className="text-sm font-medium">{type.name}</code>
                      {type.description && (
                        <span className="truncate text-xs text-muted-foreground">
                          {type.description}
                        </span>
                      )}
                    </div>
                  ))}
                </CollapsibleSection>
              </div>
            )}
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
