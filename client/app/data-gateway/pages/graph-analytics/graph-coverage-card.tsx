"use client";

import { useMemo } from "react";
import { Database } from "lucide-react";

import { Badge } from "@/components/ui-kits/badge/badge";
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
import { AnalyticsCard } from "./analytics-card";
import { useT } from "@seliseblocks/genesis-os/i18n";

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
  const { t } = useT("data.gateway.analytics");
  const unusedCount = useMemo(
    () => schemaCoverage.filter((coverage) => coverage.calls === 0).length,
    [schemaCoverage],
  );

  return (
    <AnalyticsCard
      icon={Database}
      title={t("GRAPH_COVERAGE_CARD.SCHEMA_COVERAGE")}
      headerRight={
        schemaCoverage.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("GRAPH_COVERAGE_CARD.UNUSEDCOUNT_OF_LENGTH_NEVER_CALLED_IN", { unusedCount, length: schemaCoverage.length })}
          </span>
        )
      }
    >
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <SpinnerLoader />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">{t("GRAPH_COVERAGE_CARD.COULDN_T_LOAD_COVERAGE_PLEASE_TRY")}</p>
      ) : schemaCoverage.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("GRAPH_COVERAGE_CARD.NO_SCHEMAS_DEFINED_YET")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("GRAPH_COVERAGE_CARD.SCHEMA")}</TableHead>
              <TableHead>{t("GRAPH_COVERAGE_CARD.CALLS")}</TableHead>
              <TableHead>{t("GRAPH_COVERAGE_CARD.READS")}</TableHead>
              <TableHead>{t("GRAPH_COVERAGE_CARD.WRITES")}</TableHead>
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
                      {unused && <Badge variant="secondary">{t("GRAPH_COVERAGE_CARD.UNUSED")}</Badge>}
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
    </AnalyticsCard>
  );
};
