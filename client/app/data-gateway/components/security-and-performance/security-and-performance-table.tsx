"use client";

import { Schema, SecurityTableProps } from "@/data-gateway/models/security-and-performance";
import { cn } from "@/lib/utils";
import { ChevronRight, Database, ShieldOff } from "lucide-react";

import { ACCESS_LEVEL_TO_TYPE } from "../../constants/schema-access-control";
import {
  piiFieldCount,
  schemaRisk,
  type SchemaRisk,
} from "../../utils/security-summary";
import { ACCESS_TIER_LABELS, AccessTierBadge, tierFromLevel } from "../primitives";

/**
 * View/Create/Edit/Delete, not Create/Read/Update/Delete — the verbs the
 * schema page's own access pills already use (`schema-basic-info.tsx`'s
 * `accessLevels`). This table used to spell out CRUD instead, so the same
 * four permissions read as two different vocabularies depending which screen
 * you were on. levelKey is the actual field name and unaffected by this —
 * only the label and the order (view, create, edit, delete, matching the
 * schema page's own left-to-right order) changed.
 */
const CRUD_COLUMNS = [
  { key: "V", verb: "View", levelKey: "readAccessLevel" },
  { key: "C", verb: "Create", levelKey: "writeAccessLevel" },
  { key: "E", verb: "Edit", levelKey: "editAccessLevel" },
  { key: "D", verb: "Delete", levelKey: "deleteAccessLevel" },
] as const;

const SEVERITY_EDGE: Record<SchemaRisk["severity"], string> = {
  high: "bg-access-public-dot",
  medium: "bg-access-user-dot",
  low: "bg-transparent",
};

const RISK_TEXT: Record<SchemaRisk["severity"], string> = {
  high: "text-access-public-fg",
  medium: "text-access-user-fg",
  low: "text-muted-foreground",
};

const CrudCell = ({ letter, level, verb }: { letter: string; level: number; verb: string }) => {
  if (ACCESS_LEVEL_TO_TYPE[level] === undefined) {
    return (
      <span
        className="inline-flex h-[26px] w-[30px] items-center justify-center rounded-md text-[11px] text-muted-foreground/40"
        title={`${verb} — not set`}
      >
        —
      </span>
    );
  }

  return (
    <AccessTierBadge
      level={level}
      shape="cell"
      title={`${verb} — ${ACCESS_TIER_LABELS[tierFromLevel(level)]}`}
    >
      {letter}
    </AccessTierBadge>
  );
};

const SecurityAndPerformanceTable = ({ schemas, onRowClick }: SecurityTableProps) => {
  if (!schemas.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <ShieldOff className="h-8 w-8 opacity-20" />
        <p className="text-sm">No schemas to display</p>
      </div>
    );
  }

  return (
    <div className="min-w-[760px]">
      <div className="sticky top-0 z-10 flex h-8 items-center gap-4 border-b border-border/30 bg-muted/20 px-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span className="min-w-0 flex-1">Schema</span>
        <span className="w-[186px] shrink-0 whitespace-nowrap">View · Create · Edit · Delete</span>
        <span className="w-[150px] shrink-0">Exposure</span>
        <span className="w-[110px] shrink-0">PII fields</span>
        <span className="w-6 shrink-0" />
      </div>

      <ul>
        {schemas.map((schema: Schema) => {
          const risk = schemaRisk(schema);
          const pii = piiFieldCount(schema);

          return (
            <li key={schema.schemaName}>
              <button
                type="button"
                onClick={() => onRowClick(schema)}
                // The row reads as a long run of text; the name is what a
                // screen reader should announce for it.
                aria-label={`Open ${schema.schemaName}`}
                className="group relative flex h-[52px] w-full items-center gap-4 border-b border-border/20 px-5 text-left transition-colors hover:bg-muted/20"
              >
                <span
                  className={cn("absolute inset-y-0 left-0 w-[3px]", SEVERITY_EDGE[risk.severity])}
                  aria-hidden
                />

                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Database className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-foreground">
                      {schema.schemaName}
                    </span>
                    {schema.collectionName && (
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {schema.collectionName}
                      </span>
                    )}
                  </span>
                </span>

                <span className="flex w-[186px] shrink-0 gap-1.5">
                  {CRUD_COLUMNS.map(({ key, verb, levelKey }) => (
                    <CrudCell key={key} letter={key} verb={verb} level={schema[levelKey]} />
                  ))}
                </span>

                <span
                  className={cn("w-[150px] shrink-0 text-xs font-semibold", RISK_TEXT[risk.severity])}
                >
                  {risk.label}
                </span>

                <span
                  className={cn(
                    "w-[110px] shrink-0 text-xs",
                    pii > 0 ? "text-access-user-fg" : "text-muted-foreground/60",
                  )}
                >
                  {pii === 0 ? "None" : pii === 1 ? "1 field" : `${pii} fields`}
                </span>

                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SecurityAndPerformanceTable;
