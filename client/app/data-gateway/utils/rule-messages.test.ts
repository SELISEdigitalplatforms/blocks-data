import { describe, expect, it } from "vitest";
import cases from "./rule-message-cases.json";
import { RULE_MESSAGES, RULE_MESSAGE_FORMATS } from "./rule-messages";

/**
 * The client's copy of Genesis `ValidationRuleCheck`'s messages. rule-message-cases.json is a copy of the Genesis
 * table (src/XUnitTest/DataAccess/Rules/rule-message-cases.json); both test suites run it, so the texts can't drift.
 */
describe("the save-check messages match Genesis", () => {
  it.each(Object.entries(cases.messages))("%s", (name, text) => {
    expect(RULE_MESSAGES[name as keyof typeof RULE_MESSAGES]).toBe(text);
  });

  it.each(cases.formatted.map((c) => [c.name, c.args, c.text] as const))("%s(%j)", (name, args, text) => {
    const format = RULE_MESSAGE_FORMATS[name as keyof typeof RULE_MESSAGE_FORMATS] as (...a: string[]) => string;
    expect(format(...args)).toBe(text);
  });
});
