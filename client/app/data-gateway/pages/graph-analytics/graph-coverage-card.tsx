"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui-kits/badge/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-kits/card/card";
import SpinnerLoader from "@/components/ui-kits/spinner-loader/spinner-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { cn } from "@/lib/utils";
import { IGraphLogSchemaCoverage } from "../../models/graph-log-analytics";

interface GraphCoverageCardProps {
  schemaCoverage: IGraphLogSchemaCoverage[];
  isLoading: boolean;
  isError: boolean;
}

export const GraphCoverageCard = ({
  schemaCoverage,
  isLoading,
  isError,
}: GraphCoverageCardProps) => {
  const unusedCount = useMemo(
    () => schemaCoverage.filter((coverage) => coverage.calls === 0).length,
    [schemaCoverage],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <CardTitle>Schema coverage</CardTitle>
        {schemaCoverage.length > 0 && (
          <span className="text-xs text-muted-foreground/60">
            {unusedCount} of {schemaCoverage.length} never called in this range
          </span>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <SpinnerLoader />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load coverage. Please try again.</p>
        ) : schemaCoverage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schemas defined yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Schema</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Reads</TableHead>
                <TableHead>Writes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemaCoverage.map((coverage) => {
                const unused = coverage.calls === 0;
                return (
                  <TableRow key={coverage.entityName} className={cn(unused && "opacity-60")}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{coverage.entityName}</span>
                        {unused && <Badge variant="secondary">unused</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{coverage.calls}</TableCell>
                    {/* Read-only in practice is a signal too: the write policy may be dead weight. */}
                    <TableCell className="text-muted-foreground">{coverage.queries}</TableCell>
                    <TableCell className="text-muted-foreground">{coverage.mutations}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
