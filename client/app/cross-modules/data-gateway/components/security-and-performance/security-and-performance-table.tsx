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
import { ACCESS_LEVEL_BADGE_MAP } from "@/cross-modules/data-gateway/constants/schema-access-control";
import { Schema, SecurityTableProps } from "@/cross-modules/data-gateway/models/security-and-performance";
import { Table2 } from "lucide-react";

const COLUMNS = ["Schema", "View", "Create", "Edit", "Delete"] as const;

const SecurityAndPerformanceTable = ({ schemas, onRowClick }: SecurityTableProps) => {
  if (!schemas.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Table2 className="h-8 w-8 opacity-40" />
        <p className="text-sm">No schemas found</p>
      </div>
    );
  }

  return (
    <Table className="min-w-[800px]">
      <TableHeader className="sticky top-0 bg-white dark:bg-slate-950">
        <TableRow>
          {COLUMNS.map((col) => (
            <TableHead key={col}>{col}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {schemas.map((schema: Schema) => {
          const accessLevels = [
            schema.readAccessLevel,
            schema.writeAccessLevel,
            schema.editAccessLevel,
            schema.deleteAccessLevel,
          ];
          return (
            <TableRow
              key={schema.schemaName}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onRowClick(schema)}
            >
              <TableCell className="font-medium">{schema.schemaName}</TableCell>
              {accessLevels.map((level, index) => {
                const badge = ACCESS_LEVEL_BADGE_MAP[level.toString()];
                return (
                  <TableCell key={index}>
                    {badge ? (
                      <span
                        className={cn("rounded px-2 py-0.5 text-xs font-medium", badge.colorClass)}
                      >
                        {badge.label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default SecurityAndPerformanceTable;
