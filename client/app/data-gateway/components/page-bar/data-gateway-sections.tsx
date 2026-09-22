"use client";

import { useProjectStore } from "@seliseblocks/genesis-os";
import { useDataGatewayPath } from "@/hooks/use-scoped-path";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router";

import {
  useGetDataServiceConfiguration,
  useSchemaList,
  useSecurityAndPerformanceSchemaList,
} from "../../hooks/use-configuration";
import { IDataSourceResponse } from "../../models/data-service";
import { filterCounts, RISK_FETCH_LIMIT } from "../../utils/security-summary";

type Section = {
  label: string;
  /** Appended to the scoped data-gateway path; "" is the schemas root. */
  subPath: string;
  /** How to colour the count badge, when this section has one. */
  badge?: "neutral" | "attention";
};

const SECTIONS: readonly Section[] = [
  { label: "Schemas", subPath: "", badge: "neutral" },
  { label: "Security", subPath: "/security", badge: "attention" },
  { label: "Playground", subPath: "/playground" },
  { label: "Analytics", subPath: "/analytics" },
];

const BADGE_CLASS: Record<NonNullable<Section["badge"]>, string> = {
  neutral: "bg-primary/10 text-primary",
  attention: "bg-access-public-bg text-access-public-fg",
};

/**
 * The destinations inside Data Gateway, on the same row as the title.
 *
 * These used to be scattered: Schemas and Security were the same route told
 * apart by a search param, Playground was an inline button, and Analytics was
 * buried in an overflow menu — so nothing on screen said how many sections
 * existed or which one you were in.
 *
 * Logs has no tab — the route (`/data-gateway/logs`) is untouched, but nothing
 * in the section nav points at it anymore.
 *
 * Configuration is deliberately absent too. It sets up the data source rather
 * than being a place you work, so it stays a utility icon in the page bar.
 */
export const DataGatewaySections = () => {
  const dataGatewayPath = useDataGatewayPath();
  const { pathname } = useLocation();
  const { data: configurationData } = useGetDataServiceConfiguration();
  const configuration = configurationData?.data as IDataSourceResponse | undefined;
  const analyticsEnabled = Boolean(configuration?.analyticsConfiguration?.enableAnalytics);
  const projectKey = useProjectStore().selectedProject?.tenantId ?? "";

  // A cheap read of the total — pageSize: 1 costs nothing beyond the one
  // request, and it names its own cache entry rather than borrowing the
  // sidebar's (whose pageSize/keyword change as the user types and paginates).
  const { data: schemaListQuery } = useSchemaList({
    projectKey,
    pageNo: 1,
    pageSize: 1,
    schemaType: "",
  });
  const schemasCount = schemaListQuery?.data?.totalCount;

  // Same query, same params, as the security page's own fetch (down to
  // RISK_FETCH_LIMIT): this reuses that cache entry rather than opening a
  // second 200-schema fetch whenever the page bar is on screen.
  const { data: securityListQuery } = useSecurityAndPerformanceSchemaList({
    keyword: "",
    projectKey,
    pageNo: 1,
    pageSize: RISK_FETCH_LIMIT,
    schemaType: "entity",
  });
  const attentionCount = securityListQuery?.data
    ? filterCounts(securityListQuery.data.schemas.items).attention
    : undefined;

  const sectionCount: Partial<Record<string, number>> = {
    Schemas: schemasCount,
    // Zero needing attention isn't worth a badge.
    Security: attentionCount && attentionCount > 0 ? attentionCount : undefined,
  };

  // Everything after the scoped base, so /app/<id>/data-gateway/security → "/security".
  const subPath = pathname.startsWith(dataGatewayPath)
    ? pathname.slice(dataGatewayPath.length).replace(/\/$/, "")
    : "";

  const sections = SECTIONS.filter(
    (section) => section.subPath !== "/analytics" || analyticsEnabled,
  );

  return (
    <nav
      aria-label="Data Gateway sections"
      className="flex min-w-0 shrink items-stretch gap-0.5 overflow-x-auto"
    >
      {sections.map(({ label, subPath: sectionPath, badge }) => {
        // A sub-path we don't list (configuration) leaves every tab inactive
        // rather than falsely lighting up Schemas.
        const active = subPath === sectionPath;
        const count = sectionCount[label];
        return (
          <Link
            key={label}
            to={`${dataGatewayPath}${sectionPath}`}
            aria-current={active ? "page" : undefined}
            // The badge is adjacent JSX with no text node between it and the
            // label, which a screen reader reads as one run-on word
            // ("Schemas39"); an explicit label says the same thing correctly.
            aria-label={badge && count !== undefined ? `${label} ${count}` : undefined}
            className={cn(
              "relative flex h-full shrink-0 items-center gap-1.5 px-3.5 text-[13px] transition-colors",
              active
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {badge && count !== undefined && (
              <span
                aria-hidden
                className={cn(
                  "rounded-full px-1.5 py-px text-[10.5px] font-medium leading-normal",
                  BADGE_CLASS[badge],
                )}
              >
                {count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-t-sm bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
};
