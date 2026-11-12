"use client";

import { Button } from "@/components/ui-kits/button/button";
import { CircleHelp } from "lucide-react";
import { useT } from "@seliseblocks/genesis-os/i18n";

/**
 * The details area when the selected schema id has no schema: it was deleted, is a system schema,
 * or belongs to another project (the server answers all three with the same 404). Shares the shell
 * of `CreateFirstSchemaPanel`, so the empty and the not-found states look like one family.
 */
export function SchemaNotFoundPanel({ onBackToSchemas }: Readonly<{ onBackToSchemas: () => void }>) {
  const { t } = useT("data.gateway.schema");
  return (
    // <output> carries the implicit "status" role, so the panel is announced when it replaces the details.
    <output className="flex flex-1 items-start justify-center rounded-sm border border-border/40 bg-card p-8">
      <div className="mt-[8vh] flex w-full max-w-2xl flex-col items-center text-center">
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CircleHelp className="h-6 w-6" aria-hidden />
        </div>

        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {t("SCHEMA_DETAILS_PAGE.SCHEMA_NOT_FOUND")}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t("SCHEMA_DETAILS_PAGE.SCHEMA_NOT_FOUND_DESCRIPTION")}
        </p>

        <Button type="button" variant="outline" className="mt-6" onClick={onBackToSchemas}>
          {t("SCHEMA_DETAILS_PAGE.BACK_TO_SCHEMAS")}
        </Button>
      </div>
    </output>
  );
}
