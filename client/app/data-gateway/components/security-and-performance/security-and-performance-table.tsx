"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { cn } from "@/lib/utils";
import { Schema, SecurityTableProps } from "@/data-gateway/models/security-and-performance";
import { ChevronRight, ShieldOff } from "lucide-react";

const COLUMNS = ["Schema", "View", "Create", "Edit", "Delete"] as const;

const BADGE: Record<string, { label: string; className: string }> = {
  "0": {
    label: "Inherited",
    className: "bg-muted/60 text-muted-foreground border border-border/60",
  },
  "1": {
    label: "Logged-in users",
    className: "bg-amber-500/10 text-amber-700 border border-amber-400/30 dark:text-amber-300/80 dark:border-amber-500/20",
  },
  "2": {
    label: "Public",
    className: "bg-rose-500/10 text-rose-700 border border-rose-400/30 dark:text-rose-300/80 dark:border-rose-500/20",
  },
  "3": {
    label: "Custom",
    className: "bg-emerald-500/10 text-emerald-700 border border-emerald-400/30 dark:text-emerald-300/80 dark:border-emerald-500/20",
  },
};

const AccessBadge = ({ level }: { level: number }) => {
  const badge = BADGE[level.toString()];
  if (!badge) return <span className="text-xs text-muted-foreground/40">—</span>;
  return (
    <span className={cn("inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium", badge.className)}>
      {badge.label}
    </span>
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
    <Table className="min-w-[700px]">
      <TableHeader>
        <TableRow className="border-b border-border/30 hover:bg-transparent">
          {COLUMNS.map((col) => (
            <TableHead
              key={col}
              className="h-9 bg-muted/10 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 first:pl-5"
            >
              {col}
            </TableHead>
          ))}
          <TableHead className="w-8 bg-muted/10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {schemas.map((schema: Schema) => (
          <TableRow
            key={schema.schemaName}
            className="group cursor-pointer border-b border-border/20 transition-colors hover:bg-muted/10"
            onClick={() => onRowClick(schema)}
          >
            <TableCell className="pl-5 text-sm font-medium text-foreground/90">
              {schema.schemaName}
            </TableCell>
            <TableCell><AccessBadge level={schema.readAccessLevel} /></TableCell>
            <TableCell><AccessBadge level={schema.writeAccessLevel} /></TableCell>
            <TableCell><AccessBadge level={schema.editAccessLevel} /></TableCell>
            <TableCell><AccessBadge level={schema.deleteAccessLevel} /></TableCell>
            <TableCell className="w-8 pr-3">
              <ChevronRight className="h-4 w-4 text-muted-foreground/20 transition-colors group-hover:text-muted-foreground/60" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default SecurityAndPerformanceTable;
