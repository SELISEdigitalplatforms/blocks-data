import type { IDataAccessRuleSet, IDataAccessRuleSetDto } from "../models/data-service";

// ─── String Helpers ───────────────────────────────────────────────────────────

export const isNonEmptyString = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const uniqueStrings = (values: (string | null | undefined)[]) =>
  Array.from(new Set(values.filter(isNonEmptyString).map((value) => value.trim())));

/** Alias kept for backward compatibility — identical to `uniqueStrings` */
export const filterNonEmptyStrings = uniqueStrings;

// ─── Rule-set Sanitisation ────────────────────────────────────────────────────

export const sanitizeRuleSet = (ruleSet?: IDataAccessRuleSet): IDataAccessRuleSet => ({
  roles: uniqueStrings(ruleSet?.roles ?? []),
  permissions: uniqueStrings(ruleSet?.permissions ?? []),
  users: uniqueStrings(ruleSet?.users ?? []),
});

export const createEmptyAccessRuleSet = (): IDataAccessRuleSet => ({
  roles: [],
  permissions: [],
  users: [],
});

export const normalizeAccessRuleSet = (
  access?: IDataAccessRuleSetDto | null,
): IDataAccessRuleSet => ({
  roles: filterNonEmptyStrings(access?.roles ?? []),
  permissions: filterNonEmptyStrings(access?.permissions ?? []),
  users: filterNonEmptyStrings(access?.users ?? []),
});
