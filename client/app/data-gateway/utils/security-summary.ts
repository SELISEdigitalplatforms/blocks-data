import type { AccessTier } from "../components/primitives";
import { tierFromLevel } from "../components/primitives";
import type { IPermissionAggregation } from "../models/data-service";
import type { Schema } from "../models/security-and-performance";

/** Highest-exposure thing true of a schema, worst first. */
/**
 * Risk order, the filter chips and the page-bar's "needs attention" badge are
 * all judgements about four access levels at once, which the API cannot sort
 * or filter on — so all three run client-side over one fetched page. Exact
 * while the project has 200 entity schemas or fewer; above that the security
 * page says out loud that its counts cover only the fetched set.
 *
 * Both callers (`SecurityAndPerformance` and `DataGatewaySections`) must pass
 * this exact value, or they name two different cache entries and the badge
 * fetches its own 200-schema page instead of reusing the security page's.
 */
export const RISK_FETCH_LIMIT = 200;

export type RiskKey =
  | "public-write"
  | "public-read"
  | "user-write"
  | "user-read"
  | "custom"
  | "inherited";

const RISK_ORDER: RiskKey[] = [
  "public-write",
  "public-read",
  "user-write",
  "user-read",
  "custom",
  "inherited",
];

export type SchemaRisk = {
  key: RiskKey;
  label: string;
  /** Drives the row's left edge: high is worth interrupting someone for. */
  severity: "high" | "medium" | "low";
};

const RISK_LABELS: Record<RiskKey, string> = {
  "public-write": "Public write",
  "public-read": "Public read",
  "user-write": "Signed-in write",
  "user-read": "Signed-in read",
  custom: "Custom rules",
  inherited: "Inherited",
};

const SEVERITY: Record<RiskKey, SchemaRisk["severity"]> = {
  "public-write": "high",
  "public-read": "high",
  "user-write": "medium",
  "user-read": "low",
  custom: "low",
  inherited: "low",
};

/**
 * How exposed one schema is.
 *
 * Write is judged across create, update and delete together: which of the three
 * is open matters less than the fact that something is. Tiers are resolved
 * through `tierFromLevel`, never by comparing the raw enum, which runs
 * Inherited=0, User=1, Public=2, Custom=3 and so is not in risk order.
 */
export function schemaRisk(schema: Schema): SchemaRisk {
  const read = tierFromLevel(schema.readAccessLevel);
  const writes: AccessTier[] = [
    tierFromLevel(schema.writeAccessLevel),
    tierFromLevel(schema.editAccessLevel),
    tierFromLevel(schema.deleteAccessLevel),
  ];

  const key: RiskKey = writes.includes("public")
    ? "public-write"
    : read === "public"
      ? "public-read"
      : writes.includes("user")
        ? "user-write"
        : read === "user"
          ? "user-read"
          : writes.includes("custom") || read === "custom"
            ? "custom"
            : "inherited";

  return { key, label: RISK_LABELS[key], severity: SEVERITY[key] };
}

export const piiFieldCount = (schema: Schema): number =>
  (schema.fields ?? []).filter((field) => field.isPIIData).length;

/** Most exposed first; ties keep alphabetical order so the list is stable. */
export function sortByRisk(schemas: Schema[]): Schema[] {
  return [...schemas].sort((a, b) => {
    const byRisk =
      RISK_ORDER.indexOf(schemaRisk(a).key) - RISK_ORDER.indexOf(schemaRisk(b).key);
    return byRisk !== 0 ? byRisk : a.schemaName.localeCompare(b.schemaName);
  });
}

export type SecurityFilter = "all" | "attention" | "public" | "user" | "custom";

const MATCHES: Record<SecurityFilter, (risk: RiskKey) => boolean> = {
  all: () => true,
  attention: (risk) => risk === "public-write" || risk === "public-read",
  public: (risk) => risk === "public-write" || risk === "public-read",
  user: (risk) => risk === "user-write" || risk === "user-read",
  custom: (risk) => risk === "custom",
};

export const matchesFilter = (schema: Schema, filter: SecurityFilter) =>
  MATCHES[filter](schemaRisk(schema).key);

export function filterCounts(schemas: Schema[]): Record<SecurityFilter, number> {
  return {
    all: schemas.length,
    attention: schemas.filter((s) => matchesFilter(s, "attention")).length,
    public: schemas.filter((s) => matchesFilter(s, "public")).length,
    user: schemas.filter((s) => matchesFilter(s, "user")).length,
    custom: schemas.filter((s) => matchesFilter(s, "custom")).length,
  };
}

export type ExposureSegment = {
  tier: Extract<AccessTier, "public" | "user" | "custom" | "inherited">;
  label: string;
  count: number;
  /** Share of all grants, as a percentage string ready for a width. */
  width: string;
};

export type ExposureBreakdown = {
  segments: ExposureSegment[];
  totalGrants: number;
  schemaCount: number;
};

/**
 * Every grant in the project, split by tier.
 *
 * Each entity schema carries four grants — create, read, update, delete — so
 * the total is `4 × schemas`. The aggregation counts only the three levels that
 * are explicitly set, which makes inherited the remainder rather than a number
 * the server sends.
 */
export function exposureBreakdown(
  aggregation: IPermissionAggregation | undefined,
  schemaCount: number,
): ExposureBreakdown {
  const totalGrants = schemaCount * 4;
  const publicCount = aggregation?.totalPublicPermission ?? 0;
  const user = aggregation?.totalUserPermission ?? 0;
  const custom = aggregation?.totalCustomPermission ?? 0;
  const inherited = Math.max(0, totalGrants - publicCount - user - custom);

  const counts: [ExposureSegment["tier"], string, number][] = [
    ["public", "Public", publicCount],
    ["user", "Signed-in", user],
    ["custom", "Custom", custom],
    ["inherited", "Inherited", inherited],
  ];

  return {
    totalGrants,
    schemaCount,
    segments: counts.map(([tier, label, count]) => ({
      tier,
      label,
      count,
      width: totalGrants > 0 ? `${(count / totalGrants) * 100}%` : "0%",
    })),
  };
}

export type SecurityAlert = {
  id: "public-write" | "public-read" | "public-pii";
  count: number;
  label: string;
  hint: string;
  severity: "high" | "medium";
};

/**
 * The three things worth acting on, counted over the schemas on screen.
 *
 * Unlike the exposure bar, these come from the fetched set rather than the
 * project-wide aggregation: "a public schema that also holds PII" needs each
 * schema's fields, which only the list response carries. Exact while every
 * schema fits one page — see `isComplete`.
 */
export function securityAlerts(schemas: Schema[]): SecurityAlert[] {
  const risks = schemas.map((schema) => ({ schema, risk: schemaRisk(schema).key }));

  const publicWrite = risks.filter((r) => r.risk === "public-write").length;
  const publicRead = risks.filter((r) => r.risk === "public-read").length;
  const publicPii = risks.filter(
    (r) =>
      (r.risk === "public-write" || r.risk === "public-read") &&
      piiFieldCount(r.schema) > 0,
  ).length;

  return [
    {
      id: "public-write",
      count: publicWrite,
      label: "Public write",
      hint: "Anyone can create, edit or delete records",
      severity: "high",
    },
    {
      id: "public-read",
      count: publicRead,
      label: "Public read",
      hint: "Readable without signing in",
      severity: "medium",
    },
    {
      id: "public-pii",
      count: publicPii,
      label: "PII exposed publicly",
      hint: "Fields marked PII on a publicly reachable schema",
      severity: "high",
    },
  ];
}
