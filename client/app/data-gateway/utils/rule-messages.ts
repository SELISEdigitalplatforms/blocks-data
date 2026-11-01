import { tStatic } from "@seliseblocks/genesis-os/i18n";
/**
 * The messages of Genesis `ValidationRuleCheck`, which the server sends when a rule can't be saved. The editor shows
 * the same text before saving. Checked against the shared case table (rule-message-cases.json).
 */
export const RULE_MESSAGES = {
  get AuthNotAllowed() { return tStatic("data.gateway.validation", "RULE_MESSAGES.AUTH_VALUES_AREN_T_AVAILABLE_IN"); },
  get CommaInSingleValue() { return tStatic("data.gateway.validation", "RULE_MESSAGES.A_SINGLE_VALUE_CAN_T_CONTAIN"); },
  get ConditionGroupEmpty() { return tStatic("data.gateway.validation", "RULE_MESSAGES.EACH_GROUP_OF_CONDITIONS_NEEDS_AT"); },
  get ConditionInsideList() { return tStatic("data.gateway.validation", "RULE_MESSAGES.A_RULE_ON_A_PROPERTY_INSIDE"); },
  get ConditionNamesListItem() { return tStatic("data.gateway.validation", "RULE_MESSAGES.A_CONDITION_CAN_T_NAME_A"); },
  get ConditionLeftMustBeProperty() { return tStatic("data.gateway.validation", "RULE_MESSAGES.A_CONDITION_MUST_START_WITH_A"); },
  get ConditionNeedsValue() { return tStatic("data.gateway.validation", "RULE_MESSAGES.ENTER_A_VALUE_TO_COMPARE_WITH"); },
  get ConditionOnLookup() { return tStatic("data.gateway.validation", "RULE_MESSAGES.CONDITION_ON_LOOKUP"); },
  get CountMustBeWholeNumber() { return tStatic("data.gateway.validation", "RULE_MESSAGES.ENTER_A_WHOLE_NUMBER_OF_ITEMS"); },
  get FieldComparisonItemId() { return tStatic("data.gateway.validation", "RULE_MESSAGES.ITEMID_CAN_T_BE_COMPARED_WITH"); },
  get FieldComparisonOperator() { return tStatic("data.gateway.validation", "RULE_MESSAGES.TWO_PROPERTIES_CAN_ONLY_BE_COMPARED"); },
  get FilterMustUseFixedValues() { return tStatic("data.gateway.validation", "RULE_MESSAGES.A_FILTER_COMPARES_THE_OTHER_SCHEMA"); },
  get FilterOnlyForReferences() { return tStatic("data.gateway.validation", "RULE_MESSAGES.ONLY_EXISTS_IN_AND_MUST_NOT"); },
  get NotExistsInOwnSchema() { return tStatic("data.gateway.validation", "RULE_MESSAGES.A_PROPERTY_CAN_T_BE_CHECKED"); },
  get NotOnSystemSchemas() { return tStatic("data.gateway.validation", "RULE_MESSAGES.THIS_RULE_CAN_T_BE_USED"); },
  get NowOnlyForComparisons() { return tStatic("data.gateway.validation", "RULE_MESSAGES.A_DATE_RELATIVE_TO_NOW_ONLY"); },
  get NowOnlyForDates() { return tStatic("data.gateway.validation", "RULE_MESSAGES.NOW_ONLY_FOR_DATES"); },
  get OnlyForLists() { return tStatic("data.gateway.validation", "RULE_MESSAGES.THIS_RULE_CHECKS_A_LIST_SO"); },
  get PlaceholderNotAllowed() { return tStatic("data.gateway.validation", "RULE_MESSAGES.A_FIXED_VALUE_CAN_T_CONTAIN"); },
  get TargetSchemaRequired() { return tStatic("data.gateway.validation", "RULE_MESSAGES.CHOOSE_THE_SCHEMA_TO_CHECK_AGAINST"); },
  get TooManyValues() { return tStatic("data.gateway.validation", "RULE_MESSAGES.IS_ONE_OF_IS_NOT_ONE"); },
  get UniqueItemsNeedsValues() { return tStatic("data.gateway.validation", "RULE_MESSAGES.NO_DUPLICATES_WORKS_ON_A_LIST"); },
  get ValuesMustBeAList() { return tStatic("data.gateway.validation", "RULE_MESSAGES.IS_ONE_OF_IS_NOT_ONE_2"); },
  get ValuesMustNotBeEmpty() { return tStatic("data.gateway.validation", "RULE_MESSAGES.IS_ONE_OF_IS_NOT_ONE_3"); },
} as const;

export const RULE_MESSAGE_FORMATS = {
  ValuesNotForType: (kind: string) => tStatic("data.gateway.validation", "RULE_MESSAGES.VALUES_NOT_FOR_TYPE", { kind }),
  ValueDoesNotFit: (value: string, expected: string) =>
    tStatic("data.gateway.validation", "RULE_MESSAGES.VALUE_DOES_NOT_FIT", { value, expected }),
  DuplicateValue: (value: string) => tStatic("data.gateway.validation", "RULE_MESSAGES.DUPLICATE_VALUE", { value }),
  UnknownProperty: (name: string) => tStatic("data.gateway.validation", "RULE_MESSAGES.UNKNOWN_PROPERTY", { name }),
  FieldComparisonKind: (left: string, right: string) =>
    tStatic("data.gateway.validation", "RULE_MESSAGES.FIELD_COMPARISON_KIND", { left, right }),
  InvalidPattern: (pattern: string) => tStatic("data.gateway.validation", "RULE_MESSAGES.INVALID_PATTERN", { pattern }),
  InvalidNow: (value: string) => tStatic("data.gateway.validation", "RULE_MESSAGES.INVALID_NOW", { value }),
};

/** The most values an "is one of" list takes (Genesis `ValidationRuleCheck.MaxListValues`). */
export const MAX_LIST_VALUES = 500;
