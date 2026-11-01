import type { AccessTier } from "../components/primitives";
import { tierFromLevel } from "../components/primitives";
import type { ISchemaDetails } from "../models/data-service";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export type SchemaExposure = {
  /** Which tier colour the row's dot takes. */
  tier: Extract<AccessTier, "public" | "user">;
  /** Plain English, for the dot's tooltip. */
  reason: string;
};

type Verb = "read" | "write" | "edit" | "delete";

const WRITE_VERBS: readonly Verb[] = ["write", "edit", "delete"];

const VERB_PHRASES: Record<Verb, string> = {
  get read() { return tStatic("data.gateway.schema", "ACCESS_PHRASE.VERB_READ"); },
  get write() { return tStatic("data.gateway.schema", "ACCESS_PHRASE.VERB_CREATE"); },
  get edit() { return tStatic("data.gateway.schema", "ACCESS_PHRASE.VERB_EDIT"); },
  get delete() { return tStatic("data.gateway.schema", "ACCESS_PHRASE.VERB_DELETE"); },
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
    return { tier: "public", reason: tStatic("data.gateway.schema", "SCHEMA_EXPOSURE.ANYONE_CAN_VALUE_THIS_SCHEMA", { value: VERB_PHRASES[publicWrite] }) };
  }

  if (tierFromLevel(levelFor(schema, "read")) === "public") {
    return { tier: "public", reason: tStatic("data.gateway.schema", "SCHEMA_EXPOSURE.ANYONE_CAN_READ_THIS_SCHEMA") };
  }

  const userWrite = WRITE_VERBS.find((verb) => tierFromLevel(levelFor(schema, verb)) === "user");
  if (userWrite) {
    return {
      tier: "user",
      reason: tStatic("data.gateway.schema", "SCHEMA_EXPOSURE.ANY_SIGNED_IN_USER_CAN_VALUE", { value: VERB_PHRASES[userWrite] }),
    };
  }

  return null;
}
