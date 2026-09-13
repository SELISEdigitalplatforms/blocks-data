"use client";

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
import {
  IGraphLogFailureHotspot,
  IGraphLogFailureStat,
} from "../../models/graph-log-analytics";
import { failureKindLabel } from "../../models/graph-log-history";

interface GraphFailuresCardProps {
  failureStats: IGraphLogFailureStat[];
  failureHotspots: IGraphLogFailureHotspot[];
  isLoading: boolean;
  isError: boolean;
}

export const GraphFailuresCard = ({
  failureStats,
  failureHotspots,
  isLoading,
  isError,
}: GraphFailuresCardProps) => {
  const totalFailures = failureStats.reduce((total, stat) => total + stat.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Failures by reason</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-20 items-center justify-center">
            <SpinnerLoader />
          </div>
        ) : failureStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isError ? "Couldn't load data. Please try again." : "No failed requests in this range."}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-3">
              {failureStats.map((stat) => (
                <div
                  key={stat.failureKind}
                  className="flex min-w-[140px] flex-col gap-1 rounded-sm border border-border/50 px-4 py-3"
                >
                  <span className="text-2xl font-semibold text-destructive">{stat.count}</span>
                  <span className="text-xs text-muted-foreground">
                    {failureKindLabel(stat.failureKind)}
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    {Math.round((stat.count / totalFailures) * 100)}% of failures
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground/60">
                Where they happen
              </span>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Schema</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Failures</TableHead>
                    <TableHead className="whitespace-nowrap">From outside</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failureHotspots.map((hotspot) => (
                    <TableRow key={`${hotspot.schemaName}-${hotspot.failureKind}`}>
                      <TableCell className="font-medium">{hotspot.schemaName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {failureKindLabel(hotspot.failureKind)}
                      </TableCell>
                      <TableCell>{hotspot.count}</TableCell>
                      {/* Concentrated in one schema reads as a policy problem; spread across
                          many and coming from outside reads as probing. */}
                      <TableCell
                        className={
                          hotspot.externalCount > 0 ? "text-destructive" : "text-muted-foreground"
                        }
                      >
                        {hotspot.externalCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
