import {
  LOGICAL_OPERATOR,
  NULL_OPERATORS,
  NUMBER_TO_OPERATOR,
  READABLE_OPERATORS,
} from "../constants/schema-access-control";
import type { AccessTier } from "../components/primitives";
import type { IPolicyItem, IPolicyRule, IPolicyRuleGroup } from "../models/data-service";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

/**
 * How alarming an effect is. This is not the access tier: a custom policy with
 * no rule sets is "custom" but grants nothing, and inherited says nothing at all
 * until you look at the schema.
 */
export type AccessRisk = "open" | "caution" | "scoped" | "none" | "inherited" | "unknown";

export type AccessEffect = {
  /** Short label above the sentence. */
  heading: string;
  /** One sentence, in plain English, about who can do this. */
  text: string;
  risk: AccessRisk;
};

/** Verb as it reads mid-sentence: "Anyone on the internet can *read* Order." */
const VERB_PHRASES: Record<string, string> = {
  get view() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.VERB_READ"); },
  get create() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.VERB_CREATE"); },
  get edit() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.VERB_EDIT"); },
  get delete() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.VERB_DELETE"); },
};

export const verbPhrase = (tab: string) => VERB_PHRASES[tab] ?? tab;

/** Where an operand comes from. 0 Auth, 1 Schema Fields, 2 Static Value. */
const LEFT_SOURCE_PHRASES: Record<number, string> = {
  get 0() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.THE_SIGNED_IN_USER_S"); },
  get 1() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.THE_RECORD_S"); },
  get 2() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.THE_VALUE"); },
};

const RIGHT_SOURCE_PHRASES: Record<number, string> = {
  get 0() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.THE_SIGNED_IN_USER_S"); },
  get 1() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.THE_RECORD_S"); },
  2: "",
};

const quoteList = (value: string | string[] | null | undefined): string => {
  if (Array.isArray(value)) return value.map((v) => `“${v}”`).join(" or ");
  return `“${value ?? ""}”`;
};

/**
 * One rule as a sentence fragment, e.g.
 * `the record's OwnerId equals the signed-in user's UserId`.
 *
 * `ruleToText` in schema-access-control.utils reads as a debug dump — "Auth's
 * UserId equals Schema Fields's OwnerId". This is the same information written
 * the way the inspector needs to say it out loud.
 */
export function rulePhrase(rule: IPolicyRule): string {
  const left = `${LEFT_SOURCE_PHRASES[rule.leftSource] ?? ""} ${rule.leftOperand}`.trim();
  const operator = READABLE_OPERATORS[rule.operator] ?? `operator(${rule.operator})`;

  if (NULL_OPERATORS.includes(NUMBER_TO_OPERATOR[rule.operator] ?? "")) {
    return `${left} ${operator}`;
  }

  if (rule.rightSource === 2) {
    return `${left} ${operator} ${quoteList(rule.staticValue)}`;
  }

  const rightOperand = rule.rightOperands?.length
    ? rule.rightOperands.join(", ")
    : rule.rightOperand;
  const rightSource = RIGHT_SOURCE_PHRASES[rule.rightSource] ?? "";
  return `${left} ${operator} ${`${rightSource} ${rightOperand}`.trim()}`;
}

export type RuleSetLine = {
  /** "when" opens the set; later lines carry the joiner of the group they sit in. */
  lead: string;
  text: string;
  /** 0 at the top of the set, one deeper for each group a line sits inside. */
  depth: number;
  kind: "rule" | "group";
};

/**
 * A rule set as lines: the first reads "when …", the rest carry the joiner the
 * set combines with. A nested group is a line of its own ("any of:" / "all of:")
 * followed by its contents one level deeper, which open with no lead since the
 * group line already says how they combine.
 */
export function ruleSetLines(policy: IPolicyItem): RuleSetLine[] {
  const walk = (group: IPolicyRuleGroup, depth: number): RuleSetLine[] => {
    const joiner = group.logicalOperator === LOGICAL_OPERATOR.AND ? "and" : "or";
    const items = [
      ...(group.rules ?? []).map((rule) => ({ rule })),
      ...(group.nestedGroups ?? []).map((nested) => ({ nested })),
    ];
    return items.flatMap((item, index): RuleSetLine[] => {
      const lead = index === 0 ? (depth === 0 ? "when" : "") : joiner;
      if ("rule" in item) {
        return [{ lead, text: rulePhrase(item.rule), depth, kind: "rule" }];
      }
      const matchesAll = item.nested.logicalOperator === LOGICAL_OPERATOR.AND;
      return [
        { lead, text: matchesAll ? tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.ALL_OF") : tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.ANY_OF"), depth, kind: "group" },
        ...walk(item.nested, depth + 1),
      ];
    });
  };
  return walk(policy.ruleGroup, 0);
}

const listNames = (policies: IPolicyItem[]) => {
  const names = policies.map((p) => p.policyName).filter(Boolean);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
};

/**
 * The sentence under the tier selector: who can do this, right now.
 *
 * A deny policy suppresses the claim entirely. The whole sentence rests on
 * "granted when any rule set matches", which is only true of allow-policies —
 * and the UI cannot create a deny policy, but a schema import can
 * (`SchemaImportMapping`). People make security decisions on this line, so
 * where it cannot be stated truthfully it is not stated at all.
 */
export function accessEffect({
  tier,
  tab,
  subject,
  policies = [],
}: {
  tier: AccessTier;
  /** view | create | edit | delete */
  tab: string;
  /** What is being protected, e.g. "Order" or "Order.Email". */
  subject: string;
  policies?: IPolicyItem[];
}): AccessEffect {
  const verb = verbPhrase(tab);

  if (tier === "public") {
    return {
      heading: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.ANYONE_NO_SIGN_IN"),
      text: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.ANYONE_ON_THE_INTERNET_CAN_VERB", { verb, subject }),
      risk: "open",
    };
  }

  if (tier === "user") {
    return {
      heading: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.EVERY_SIGNED_IN_USER"),
      text: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.ANY_SIGNED_IN_USER_IN_THIS", { verb, subject }),
      risk: "caution",
    };
  }

  if (tier === "inherited") {
    return {
      heading: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.INHERITED"),
      text: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.FOLLOWS_WHATEVER_THE_SCHEMA_ALLOWS_FOR", { value: verb === "read" ? "reading" : verb }),
      risk: "inherited",
    };
  }

  if (policies.some((policy) => policy.isAllowPolicy === false)) {
    return {
      heading: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.CANNOT_BE_SUMMARISED"),
      text:
        tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.THIS_POLICY_INCLUDES_A_DENY_RULE") +
        tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.READ_THE_RULE_SETS_BELOW_RATHER"),
      risk: "unknown",
    };
  }

  // The trap: custom with nothing in it looks configured and grants nothing.
  if (policies.length === 0) {
    return {
      heading: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.NOBODY"),
      text: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.A_CUSTOM_POLICY_WITH_NO_RULE", { verb, subject }),
      risk: "none",
    };
  }

  return {
    heading: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.EFFECT"),
    text:
      policies.length === 1
        ? tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.SIGNED_IN_USER_CAN_WHEN_MATCHES", { verb, subject, names: listNames(policies) })
        : tStatic(DATA_GATEWAY_SCHEMA_MODULE, "ACCESS_PHRASE.SIGNED_IN_USER_CAN_WHEN_ANY_MATCH", { verb, subject, count: policies.length, names: listNames(policies) }),
    risk: "scoped",
  };
}
