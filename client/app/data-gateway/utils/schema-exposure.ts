import type { AccessTier } from "../components/primitives";
import { tierFromLevel } from "../components/primitives";
import type { ISchemaDetails } from "../models/data-service";

export type SchemaExposure = {
  /** Which tier colour the row's dot takes. */
  tier: Extract<AccessTier, "public" | "user">;
  /** Plain English, for the dot's tooltip. */
  reason: string;
};

type Verb = "read" | "write" | "edit" | "delete";

const WRITE_VERBS: readonly Verb[] = ["write", "edit", "delete"];

const VERB_PHRASES: Record<Verb, string> = {
  read: "read",
  write: "create records in",
  edit: "edit",
  delete: "delete from",
};

const levelFor = (schema: Pick<ISchemaDetails, `${Verb}AccessLevel`>, verb: Verb) =>
  schema[`${verb}AccessLevel` as const];

/**
 * What is worth warning about on a schema row.
 *
 * Only two situations earn a dot: anyone at all can reach the data, or any
 * signed-in user can change it. Signed-in *read* is the product default, so
 * dotting it would put a mark on almost every row and mean nothing.
 *
 * Severity is judged by tier, never by the raw enum — SchemaAccessLevel is
 * Inherited=0, User=1, Public=2, Custom=3, so numeric order is not risk order.
 */
export function schemaExposure(
  schema: Pick<ISchemaDetails, `${Verb}AccessLevel`>,
): SchemaExposure | null {
  const publicWrite = WRITE_VERBS.find((verb) => tierFromLevel(levelFor(schema, verb)) === "public");
  if (publicWrite) {
    return { tier: "public", reason: `Anyone can ${VERB_PHRASES[publicWrite]} this schema` };
  }

  if (tierFromLevel(levelFor(schema, "read")) === "public") {
    return { tier: "public", reason: "Anyone can read this schema" };
  }

  const userWrite = WRITE_VERBS.find((verb) => tierFromLevel(levelFor(schema, verb)) === "user");
  if (userWrite) {
    return {
      tier: "user",
      reason: `Any signed-in user can ${VERB_PHRASES[userWrite]} this schema`,
    };
  }

  return null;
}
