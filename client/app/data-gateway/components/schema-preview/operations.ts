import { tStatic } from "@seliseblocks/genesis-os/i18n";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

export type OperationGroup = "query" | "insert" | "update" | "delete";

/** The preview drawer's operation rail, shared by the REST and GraphQL sides. */
export const OPERATIONS = [
  {
    value: "query",
    get label() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "SCHEMA_PREVIEW_DRAWER.QUERY"); },
    icon: Search,
    iconColor: "text-blue-500",
    activeBg: "bg-blue-50 dark:bg-blue-950/50",
    activeText: "text-blue-700 dark:text-blue-300",
    indicatorColor: "bg-blue-500",
    badgeBg:
      "bg-blue-500/10 text-blue-700 border border-blue-400/30 dark:text-blue-300/80 dark:border-blue-500/20",
    sectionBorder: "border-l-2 border-blue-400/50",
  },
  {
    value: "insert",
    get label() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "SCHEMA_PREVIEW_DRAWER.INSERT"); },
    icon: Plus,
    iconColor: "text-emerald-500",
    activeBg: "bg-emerald-50 dark:bg-emerald-950/50",
    activeText: "text-emerald-700 dark:text-emerald-300",
    indicatorColor: "bg-emerald-500",
    badgeBg:
      "bg-emerald-500/10 text-emerald-700 border border-emerald-400/30 dark:text-emerald-300/80 dark:border-emerald-500/20",
    sectionBorder: "border-l-2 border-emerald-400/50",
  },
  {
    value: "update",
    get label() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "common:UPDATE"); },
    icon: Pencil,
    iconColor: "text-amber-500",
    activeBg: "bg-amber-50 dark:bg-amber-950/50",
    activeText: "text-amber-700 dark:text-amber-300",
    indicatorColor: "bg-amber-500",
    badgeBg:
      "bg-amber-500/10 text-amber-700 border border-amber-400/30 dark:text-amber-300/80 dark:border-amber-500/20",
    sectionBorder: "border-l-2 border-amber-400/50",
  },
  {
    value: "delete",
    get label() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "common:DELETE"); },
    icon: Trash2,
    iconColor: "text-red-500",
    activeBg: "bg-red-50 dark:bg-red-950/50",
    activeText: "text-red-700 dark:text-red-300",
    indicatorColor: "bg-red-500",
    badgeBg:
      "bg-rose-500/10 text-rose-700 border border-rose-400/30 dark:text-rose-300/80 dark:border-rose-500/20",
    sectionBorder: "border-l-2 border-red-400/50",
  },
] as const;

export const operationFor = (group: OperationGroup) =>
  OPERATIONS.find((op) => op.value === group) ?? OPERATIONS[0];
