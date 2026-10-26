/**
 * The messages of Genesis `ValidationRuleCheck`, which the server sends when a rule can't be saved. The editor shows
 * the same text before saving. Checked against the shared case table (rule-message-cases.json).
 */
export const RULE_MESSAGES = {
  AuthNotAllowed: "Auth values aren't available in validation rules: use an access policy",
  CommaInSingleValue: "A single value can't contain a comma: use \"is one of\" for a list",
  ConditionGroupEmpty: "Each group of conditions needs at least one condition",
  ConditionInsideList: "A rule on a property inside a list of objects can't have a condition yet",
  ConditionNamesListItem: "A condition can't name a property inside a list of objects yet",
  ConditionLeftMustBeProperty: "A condition must start with a property of the record",
  ConditionNeedsValue: "Enter a value to compare with",
  ConditionOnLookup: "\"Exists in\" and \"must not exist in\" rules can't have a condition yet: use a filter on the other schema",
  CountMustBeWholeNumber: "Enter a whole number of items, 0 or more",
  FieldComparisonItemId: "ItemId can't be compared with another property",
  FieldComparisonOperator: "Two properties can only be compared with equals, is not, greater than or less than",
  FilterMustUseFixedValues: "A filter compares the other schema's properties with fixed values only",
  FilterOnlyForReferences: "Only \"exists in\" and \"must not exist in\" rules take a filter",
  NotExistsInOwnSchema: "A property can't be checked against its own schema: mark it as unique instead",
  NotOnSystemSchemas: "This rule can't be used on a system schema: system schemas take only the older rule types, with no condition, filter or date relative to now",
  NowOnlyForComparisons: "A date relative to now only works in greater than, less than and range rules",
  NowOnlyForDates: "A date relative to now only works on a date-time property",
  OnlyForLists: "This rule checks a list, so it only works on a list property",
  PlaceholderNotAllowed: "A fixed value can't contain {{…}}: compare with a property instead",
  TargetSchemaRequired: "Choose the schema to check against",
  TooManyValues: "Is one of / is not one of takes at most 500 values",
  UniqueItemsNeedsValues: "No duplicates works on a list of values, not a list of objects",
  ValuesMustBeAList: "Is one of / is not one of needs a list of values",
  ValuesMustNotBeEmpty: "Is one of / is not one of needs at least one value",
} as const;

export const RULE_MESSAGE_FORMATS = {
  ValuesNotForType: (kind: string) => `Is one of / is not one of can't be used on a ${kind} property`,
  ValueDoesNotFit: (value: string, expected: string) => `"${value}" isn't a valid value here (expected: ${expected})`,
  DuplicateValue: (value: string) => `"${value}" is listed twice`,
  UnknownProperty: (name: string) => `${name} isn't a property of this schema`,
  FieldComparisonKind: (left: string, right: string) => `${left} and ${right} hold different kinds of value and can't be compared`,
  InvalidPattern: (pattern: string) => `"${pattern}" isn't a valid regular expression`,
  InvalidNow: (value: string) => `"${value}" isn't a date relative to now: write {{Now}}, {{Now-18y}} or {{Now+30d}} (units y, mo, d, h, min)`,
};

/** The most values an "is one of" list takes (Genesis `ValidationRuleCheck.MaxListValues`). */
export const MAX_LIST_VALUES = 500;
