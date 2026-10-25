"use client";

import { TableCell, TableRow } from "@/components/ui-kits/table/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui-kits/tooltip/tooltip";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, Shield } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { typeOptions } from "../../constants/input-restrictions";
import { ACCESS_LEVEL_TO_TYPE, ACCESS_TYPES } from "../../constants/schema-access-control";
import type { IField } from "../../models/data-service";
import type { NestedTreeRow, TreeGuide } from "../../utils/nested-tree.util";
import { getValidationDisplayInfo } from "../../utils/schema-normalization";
import { FieldFlags, RequiredBadge, TypeChip, flagTitlesFromField, flagsFromField } from "../primitives";
import { DefaultValueButton } from "./default-value-button";

/**
 * The tree drawing of the schema table: guide lines, the open/close chevron, and the read-only rows
 * of nested properties. The lines are drawn against the Property cell itself (it is `relative`), so
 * they run its full height whatever the other cells in the row make it.
 *
 * Geometry: the cell's own left padding (1rem), then one 20px step per depth level, then the 20px
 * chevron slot, then the name. A level's line runs down the middle of its step, which is also the
 * middle of the parent's chevron slot one level up, so a branch leaves from under its parent's chevron.
 */
const STEP = 20;
const CELL_INSET = "1rem";
const LINE_CLASS = "pointer-events-none absolute bg-border";

const lineX = (level: number) => `calc(${CELL_INSET} + ${level * STEP + STEP / 2 - 0.5}px)`;

/** Left padding that puts a row's chevron slot after its guides. */
export const treeIndent = (depth: number): CSSProperties => ({ paddingLeft: depth * STEP });

/** The guide lines of one nested row, one per depth level. */
export function TreeGuides({ guides }: Readonly<{ guides: TreeGuide[] }>) {
  return (
    <>
      {guides.map((guide, index) => {
        if (guide === "none") return null;
        const x = lineX(index);
        return (
          // Guides are positional and never reorder; the index is their identity.
          <span key={`${index}-${guide}`} aria-hidden>
            <span
              className={cn(LINE_CLASS, "top-0 w-px", guide === "end" ? "h-1/2" : "-bottom-px")}
              style={{ left: x }}
            />
            {guide !== "through" && (
              <span className={cn(LINE_CLASS, "top-1/2 h-px")} style={{ left: x, width: STEP / 2 + 0.5 }} />
            )}
          </span>
        );
      })}
    </>
  );
}

/** The line that drops from an open row's chevron to its first child. */
export function TreeStem({ depth }: Readonly<{ depth: number }>) {
  return (
    <span
      aria-hidden
      className={cn(LINE_CLASS, "-bottom-px w-px")}
      style={{ left: lineX(depth), top: "calc(50% + 10px)" }}
    />
  );
}

/** The chevron that opens an object property, or says why it can't. */
export function TreeToggle({
  expanded,
  label,
  blockedReason,
  onToggle,
}: Readonly<{ expanded: boolean; label: string; blockedReason?: string | null; onToggle: () => void }>) {
  const button = (
    <button
      type="button"
      onClick={onToggle}
      disabled={Boolean(blockedReason)}
      aria-expanded={expanded}
      aria-label={label}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
        expanded ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
        blockedReason && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-150", expanded && "rotate-90")} strokeWidth={2.4} />
    </button>
  );
  if (!blockedReason) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{blockedReason}</TooltipContent>
    </Tooltip>
  );
}

/** "3 fields" beside an object property's name. */
export function FieldCount({ count }: Readonly<{ count: number | undefined }>) {
  if (!count) return null;
  return (
    <span className="shrink-0 rounded-full border border-border/60 px-1.5 text-[10.5px] leading-4 text-muted-foreground">
      {count} {count === 1 ? "field" : "fields"}
    </span>
  );
}

const RULE_BUTTON_CLASS =
  "flex h-[26px] shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40";
const RULE_IDLE_CLASS = "border-border text-muted-foreground hover:border-primary/40 hover:text-primary";
const RULE_DISABLED_CLASS = "cursor-not-allowed border-border/60 text-muted-foreground/50";

function DisabledRule({ reason, children, wide = false }: Readonly<{ reason: string; children: ReactNode; wide?: boolean }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" disabled aria-label={reason} className={cn(RULE_BUTTON_CLASS, RULE_DISABLED_CLASS, wide ? "min-w-[28px] px-1" : "w-[26px]")}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export interface NestedRowActions {
  onToggle: (path: string) => void;
  onOpenAccess: (path: string, field: IField) => void;
  onOpenValidation: (path: string, field: IField) => void;
  onOpenDefault: (path: string, field: IField) => void;
}

/**
 * One nested property, read-only, in the same columns as the table's own rows. Nested properties
 * belong to their child schema, so they are changed there; here they are shown and their rules
 * (stored on this entity, by dotted path) are opened.
 */
export function NestedTreeRowView({
  row,
  columnCount,
  showRules,
  showAccess,
  showDefault,
  activeRule,
  actions,
}: Readonly<{
  row: NestedTreeRow;
  /** Every column, for the loading and empty placeholders. */
  columnCount: number;
  showRules: boolean;
  showAccess: boolean;
  showDefault: boolean;
  /** The Rules-column panel open for this row in the docked inspector, if any. */
  activeRule: "validation" | "default" | null;
  actions: NestedRowActions;
}>) {
  if (row.kind !== "field") {
    return (
      <TableRow className="bg-muted/20 hover:bg-muted/20">
        <TableCell colSpan={columnCount} className="relative py-2.5 align-middle">
          <TreeGuides guides={row.guides} />
          <span style={treeIndent(row.depth)} className="block pl-6 text-xs text-muted-foreground">
            {row.kind === "loading" ? "Loading fields…" : "No fields yet"}
          </span>
        </TableCell>
      </TableRow>
    );
  }

  const { field, path } = row;
  const isObject = Boolean(row.childSchema);
  const isPrimitive = typeOptions.includes(field.type);
  const validation = getValidationDisplayInfo(field);
  const hasCustomAccess = [field.readAccessLevel, field.writeAccessLevel, field.editAccessLevel].some(
    (level) => (ACCESS_LEVEL_TO_TYPE[level ?? 0] ?? ACCESS_TYPES.INHERITED) !== ACCESS_TYPES.INHERITED,
  );
  const objectReason = `Rules apply to the fields inside ${field.name}`;

  return (
    <TableRow className={cn("bg-muted/20 hover:bg-muted/30", activeRule && "bg-primary/[0.06] hover:bg-primary/[0.08]")} data-tree-depth={row.depth}>
      {/* Property */}
      <TableCell className="relative py-3 align-middle" title={path}>
        <TreeGuides guides={row.guides} />
        {row.isExpanded && <TreeStem depth={row.depth} />}
        <div className="flex min-w-0 items-center gap-1.5" style={treeIndent(row.depth)}>
          <span className="flex w-5 shrink-0 items-center justify-center">
            {isObject ? (
              <TreeToggle
                expanded={row.isExpanded}
                label={`${row.isExpanded ? "Collapse" : "Expand"} ${path}`}
                blockedReason={row.blockedReason}
                onToggle={() => actions.onToggle(path)}
              />
            ) : (
              <span aria-hidden className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            )}
          </span>
          <span className="truncate pl-0.5 font-mono text-[13px] text-foreground/85">{field.name}</span>
          {isObject && <FieldCount count={row.childSchema?.fields?.length} />}
        </div>
      </TableCell>

      {/* Type */}
      <TableCell className="py-3 align-middle">
        <TypeChip type={field.type} isArray={field.isArray} className="min-w-0 max-w-full truncate" />
      </TableCell>

      {/* Required */}
      <TableCell className="py-3 align-middle">{isPrimitive ? <RequiredBadge requiredOn={field.requiredOn} /> : null}</TableCell>

      {/* Flags */}
      <TableCell className="py-3 align-middle">
        <FieldFlags flags={flagsFromField(field)} titles={flagTitlesFromField(field)} />
      </TableCell>

      {/* Description */}
      <TableCell className="px-3 py-3 align-middle md:px-3">
        <span className="block truncate text-sm text-muted-foreground" title={field.description}>
          {field.description || "—"}
        </span>
      </TableCell>

      {/* Rules */}
      {showRules && (
        <TableCell className="py-3 align-middle">
          <div className="flex h-9 items-center gap-1">
            {showAccess &&
              (isPrimitive ? (
                <button
                  type="button"
                  onClick={() => actions.onOpenAccess(path, field)}
                  aria-label={`View access for ${path}`}
                  className={cn(
                    RULE_BUTTON_CLASS,
                    "w-[26px]",
                    hasCustomAccess ? "border-access-custom-border bg-access-custom-bg text-access-custom-fg" : RULE_IDLE_CLASS,
                  )}
                >
                  <Shield className="h-3.5 w-3.5" />
                </button>
              ) : (
                <DisabledRule reason={objectReason}>
                  <Shield className="h-3.5 w-3.5" />
                </DisabledRule>
              ))}

            {isPrimitive ? (
              <button
                type="button"
                onClick={() => actions.onOpenValidation(path, field)}
                aria-expanded={activeRule === "validation"}
                aria-label={`Manage validations for ${path}${validation.total > 0 ? ` (${validation.total})` : ""}`}
                className={cn(
                  RULE_BUTTON_CLASS,
                  "min-w-[28px] gap-1 px-1",
                  activeRule === "validation" && "border-primary bg-primary/15 text-primary",
                  activeRule !== "validation" && validation.total > 0 && "border-primary/30 bg-primary/10 text-primary",
                  activeRule !== "validation" && validation.total === 0 && RULE_IDLE_CLASS,
                )}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                {validation.total > 0 && (
                  <span aria-hidden className="text-[11px] font-semibold">
                    {validation.total}
                  </span>
                )}
              </button>
            ) : (
              <DisabledRule reason={objectReason} wide>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </DisabledRule>
            )}

            {showDefault && (
              <DefaultValueButton
                fieldName={path}
                fieldType={field.type}
                isNewField={false}
                defaultValue={field.defaultValue ?? null}
                active={activeRule === "default"}
                onOpen={() => actions.onOpenDefault(path, field)}
              />
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
