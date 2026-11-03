import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, Minus, Pencil, Plus } from "lucide-react";

import type { FieldChange, SchemaDiff } from "../../utils/schema-diff";
import { useT } from "@seliseblocks/genesis-os/i18n";

const KIND_STYLE: Record<FieldChange["kind"], { icon: typeof Plus; className: string }> = {
  added: { icon: Plus, className: "text-access-custom-fg" },
  removed: { icon: Minus, className: "text-blocks-error-800" },
  renamed: { icon: ArrowRight, className: "text-warning-800" },
  modified: { icon: Pencil, className: "text-muted-foreground" },
};

function ChangeRow({ change }: { change: FieldChange }) {
  const { t } = useT("data.gateway.schema");
  const { icon: Icon, className } = KIND_STYLE[change.kind];

  return (
    <li className="flex items-start gap-2 py-1">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", className)} aria-hidden />
      <span className="min-w-0 text-xs text-foreground">
        {change.kind === "renamed" && (
          <>
            <span className="font-mono">{change.from}</span> →{" "}
            <span className="font-mono">{change.to}</span>
            {change.attributes.length > 0 && (
              <span className="text-muted-foreground"> ({change.attributes.join(", ")})</span>
            )}
          </>
        )}
        {change.kind !== "renamed" && change.kind === "modified" && (
          <>
            <span className="font-mono">{change.name}</span>
            <span className="text-muted-foreground"> — {change.attributes.join(", ")}</span>
          </>
        )}
        {change.kind !== "renamed" && change.kind !== "modified" && (
          <span className="font-mono">{change.name || t("SCHEMA_CHANGE_REVIEW.UNNAMED_FIELD")}</span>
        )}
      </span>
    </li>
  );
}

/**
 * What is about to be saved, field by field.
 *
 * The confirmation was one paragraph that said updates "will impact all
 * existing data" without saying which fields, so it read the same whether you
 * had fixed a description or dropped a column. Renames get their own warning:
 * the API keys fields by name and cannot tell a rename from a delete plus an
 * add, so the stored values go.
 */
export function SchemaChangeReview({ diff }: { diff: SchemaDiff }) {
  const { t } = useT("data.gateway.schema");
  const renamed = diff.changes.filter((c) => c.kind === "renamed");
  const removed = diff.changes.filter((c) => c.kind === "removed");

  return (
    <div className="space-y-3">
      <ul className="max-h-56 overflow-y-auto">
        {diff.changes.map((change, index) => (
          <ChangeRow key={`${change.kind}-${index}`} change={change} />
        ))}
      </ul>

      {diff.losesData && (
        <div className="flex items-start gap-2 rounded-md border border-base-error bg-blocks-error-100 px-3 py-2 text-blocks-error-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p className="text-xs leading-relaxed">
            {removed.length > 0 && (
              <>
                {t("SCHEMA_CHANGE_REVIEW.REMOVING")} {removed.length === 1 ? t("SCHEMA_CHANGE_REVIEW.A_FIELD") : "fields"} {t("SCHEMA_CHANGE_REVIEW.DELETES_THE_STORED_VALUES")}{" "}
              </>
            )}
            {renamed.length > 0 && (
              <>
                {t("SCHEMA_CHANGE_REVIEW.A_RENAME_IS_SAVED_AS_A")}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
