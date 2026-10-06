"use client";

import { Button } from "@/components/ui-kits/button/button";
import { cn } from "@/lib/utils";
import { CornerDownRight, Database, Plus, Upload } from "lucide-react";

const KINDS = [
  {
    kind: "Entity" as const,
    title: "Entity",
    description:
      "A top-level record with its own collection, queries and mutations. Carries its own access rules.",
    examples: "Order · Customer · Product",
    icon: Database,
    border: "border-primary/30",
    background: "bg-primary/5 hover:bg-primary/10",
    iconTint: "bg-primary/10 text-primary",
  },
  {
    kind: "DTO" as const,
    title: "Child",
    description:
      "A reusable shape nested inside an entity. No collection of its own, and it inherits the parent's access.",
    examples: "OrderItem · Address · TaxLine",
    icon: CornerDownRight,
    border: "border-border/40",
    background: "hover:bg-muted/20",
    iconTint: "bg-muted text-muted-foreground",
  },
];

/**
 * The desktop main panel when nothing is selected — either the project has
 * no schemas at all, or it has some and none is picked yet. Both land here
 * rather than the old bare "select a schema" text, matching the board's own
 * first-run canvas.
 */
export function CreateFirstSchemaPanel({
  onCreateSchema,
  onImportSchema,
}: {
  onCreateSchema: (kind?: "Entity" | "DTO") => void;
  onImportSchema: () => void;
}) {
  return (
    <div className="flex flex-1 items-start justify-center rounded-sm border border-border/40 bg-card p-8">
      <div className="mt-[8vh] flex w-full max-w-2xl flex-col items-center text-center">
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Database className="h-6 w-6" aria-hidden />
        </div>

        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Create your first schema
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          A schema defines one shape of data and generates its GraphQL queries
          and mutations. Pick the kind you need — you can add the other
          later.
        </p>

        <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
          {KINDS.map(({ kind, title, description, examples, icon: Icon, border, background, iconTint }) => (
            <button
              key={kind}
              type="button"
              onClick={() => onCreateSchema(kind)}
              className={cn(
                // rounded-sm, matching every other card in the shell — these
                // were the only rounded-lg surfaces on the page.
                "dg-interactive flex flex-1 flex-col items-start rounded-sm border p-4 text-left hover:ring-2 hover:ring-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                border,
                background,
              )}
            >
              <span className="flex w-full items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
                    iconTint,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-foreground">{title}</span>
              </span>
              <span className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </span>
              <span className="mt-2.5 font-mono text-[11px] text-muted-foreground/60">
                {examples}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button className="gap-1.5" onClick={() => onCreateSchema()}>
            <Plus className="h-4 w-4" aria-hidden />
            New schema
          </Button>
          <span className="text-xs text-muted-foreground/60">or</span>
          <Button variant="outline" className="gap-1.5" onClick={onImportSchema}>
            <Upload className="h-4 w-4" aria-hidden />
            Import from file
          </Button>
        </div>
      </div>
    </div>
  );
}
