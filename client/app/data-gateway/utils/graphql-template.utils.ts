import { readonlyPropertyNames } from "../constants/input-restrictions";
import type {
  SchemaPreviewPayload,
  TemplateField,
  TemplateSection,
} from "../models/schema-preview.types";
import { SAMPLE_VALUE_BY_TYPE } from "../models/schema-preview.types";

// ─── JSON Formatting ──────────────────────────────────────────────────────────

export const formatPreviewJson = (previewData: SchemaPreviewPayload) =>
  JSON.stringify(previewData, null, 2);

// ─── Field Normalization ──────────────────────────────────────────────────────

export const normalizeTemplateFields = (fields?: TemplateField[]): TemplateField[] => {
  if (!Array.isArray(fields)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: TemplateField[] = [];

  fields.forEach((field) => {
    const rawName = typeof field?.name === "string" ? field.name.trim() : "";
    if (!rawName || seen.has(rawName)) {
      return;
    }

    normalized.push({
      name: rawName,
      type: field?.type ?? undefined,
      isArray: Boolean(field?.isArray),
    });
    seen.add(rawName);
  });

  return normalized;
};

export const isReadonlyField = (fieldName: string) => readonlyPropertyNames.includes(fieldName);

// ─── Sample Values ────────────────────────────────────────────────────────────

export const getSampleValueFromPreviewType = (previewValue: unknown): string => {
  if (typeof previewValue === "string") {
    const normalized = previewValue.toLowerCase();
    return SAMPLE_VALUE_BY_TYPE[normalized] ?? '"value"';
  }
  return '"value"';
};

export const formatNestedObject = (obj: Record<string, unknown>, indentLevel: number): string => {
  const indent = "      ".repeat(indentLevel);
  const lines: string[] = [];

  Object.entries(obj).forEach(([key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      const firstItem = value[0];
      if (typeof firstItem === "object" && firstItem !== null) {
        // Nested array of DTOs - format as [{ ... }]
        const nestedDto = formatNestedObject(firstItem, indentLevel + 1);
        lines.push(`${indent}${key}: [{\n${nestedDto}\n${indent}}]`);
      } else {
        // Array of primitives
        const sample = getSampleValueFromPreviewType(firstItem);
        lines.push(`${indent}${key}: [${sample}]`);
      }
    } else if (typeof value === "object" && value !== null) {
      // Nested DTO object
      const nestedDto = formatNestedObject(value as Record<string, unknown>, indentLevel + 1);
      lines.push(`${indent}${key}: {\n${nestedDto}\n${indent}}`);
    } else {
      // Primitive value
      const sample = getSampleValueFromPreviewType(value);
      lines.push(`${indent}${key}: ${sample}`);
    }
  });

  return lines.join("\n");
};

export const getSampleValue = (
  field: TemplateField,
  previewData?: SchemaPreviewPayload,
  indentLevel = 0,
): string => {
  // Check if we have preview data for this field (indicates nested DTO)
  if (previewData && field.name in previewData) {
    const fieldValue = previewData[field.name];

    // Handle array of DTOs
    if (Array.isArray(fieldValue) && fieldValue.length > 0) {
      const firstItem = fieldValue[0];
      if (typeof firstItem === "object" && firstItem !== null) {
        // It's an array of DTO objects - format as [{ ... }]
        const indent = "      ".repeat(indentLevel);
        const nestedDto = formatNestedObject(firstItem, indentLevel + 1);
        return `[{\n${nestedDto}\n${indent}}]`;
      }
    }

    // Handle single DTO object
    if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) {
      const indent = "      ".repeat(indentLevel);
      return `{\n${formatNestedObject(fieldValue as Record<string, unknown>, indentLevel + 1)}\n${indent}}`;
    }
  }

  // Fall back to type-based sample value for primitives
  const normalizedType = typeof field.type === "string" ? field.type.trim().toLowerCase() : "";
  const sample = SAMPLE_VALUE_BY_TYPE[normalizedType] ?? '"value"';

  if (field.isArray) {
    return `[${sample}]`;
  }

  return sample;
};

// ─── Template Formatting ──────────────────────────────────────────────────────

export const formatInputAssignments = (
  fields: TemplateField[],
  previewData?: SchemaPreviewPayload,
) => {
  if (!fields.length) {
    return [];
  }

  return fields.map((field) => {
    const sampleValue = getSampleValue(field, previewData, 1);
    return `      ${field.name}: ${sampleValue}`;
  });
};

export const formatSelectionFields = (
  fields: TemplateField[],
  previewData?: SchemaPreviewPayload,
  indentLevel = 1,
) => {
  if (!fields.length) {
    return ["      __typename"];
  }

  const indent = "      ".repeat(indentLevel);
  const lines: string[] = [];

  // Helper function to recursively format nested objects
  const formatNestedSelection = (obj: Record<string, unknown>, level: number): string[] => {
    const nestedIndent = "      ".repeat(level);
    const nestedLines: string[] = [];

    if (Object.keys(obj).length === 0) {
      return [`${nestedIndent}__typename`];
    }

    Object.entries(obj).forEach(([key, value]) => {
      // Handle array of DTOs
      if (Array.isArray(value) && value.length > 0) {
        const firstItem = value[0];
        if (typeof firstItem === "object" && firstItem !== null) {
          nestedLines.push(`${nestedIndent}${key} {`);
          const innerLines = formatNestedSelection(firstItem as Record<string, unknown>, level + 1);
          nestedLines.push(...innerLines);
          nestedLines.push(`${nestedIndent}}`);
          return;
        }
      }

      // Handle single DTO object
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        nestedLines.push(`${nestedIndent}${key} {`);
        const innerLines = formatNestedSelection(value as Record<string, unknown>, level + 1);
        nestedLines.push(...innerLines);
        nestedLines.push(`${nestedIndent}}`);
        return;
      }

      // Primitive field
      nestedLines.push(`${nestedIndent}${key}`);
    });

    return nestedLines;
  };

  fields.forEach((field) => {
    // Check if this field is a DTO (has nested object in preview data)
    if (previewData && field.name in previewData) {
      const fieldValue = previewData[field.name];

      // Handle array of DTOs
      if (Array.isArray(fieldValue) && fieldValue.length > 0) {
        const firstItem = fieldValue[0];
        if (typeof firstItem === "object" && firstItem !== null) {
          // Nested DTO object in array
          lines.push(`${indent}${field.name} {`);
          const nestedLines = formatNestedSelection(
            firstItem as Record<string, unknown>,
            indentLevel + 1,
          );
          lines.push(...nestedLines);
          lines.push(`${indent}}`);
          return;
        }
      }

      // Handle single DTO object
      if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) {
        lines.push(`${indent}${field.name} {`);
        const nestedLines = formatNestedSelection(
          fieldValue as Record<string, unknown>,
          indentLevel + 1,
        );
        lines.push(...nestedLines);
        lines.push(`${indent}}`);
        return;
      }
    }

    // Simple field
    lines.push(`${indent}${field.name}`);
  });

  return lines;
};

// ─── Mutation / Query Builders ────────────────────────────────────────────────

export const buildInsertMutation = (
  operationName: string,
  fields: TemplateField[],
  previewData?: SchemaPreviewPayload,
) => {
  const lines = [
    "mutation {",
    `  insert${operationName}(`,
    "    input: {",
    ...formatInputAssignments(fields, previewData),
    "    }",
    "  ) {",
    "    acknowledged",
    "    totalImpactedData",
    "    itemId",
    "  }",
    "}",
  ];

  return lines.join("\n");
};

export const buildUpdateMutation = (
  operationName: string,
  fields: TemplateField[],
  previewData?: SchemaPreviewPayload,
) => {
  const lines = [
    "mutation {",
    `  update${operationName}(`,
    '    filter: "{}"',
    "    input: {",
    ...formatInputAssignments(fields, previewData),
    "    }",
    "  ) {",
    "    acknowledged",
    "    totalImpactedData",
    "    itemId",
    "  }",
    "}",
  ];

  return lines.join("\n");
};

export const buildDeleteMutation = (operationName: string) => {
  const lines = [
    "mutation {",
    `  delete${operationName}(`,
    '    filter: "{}"',
    "  ) {",
    "    acknowledged",
    "    totalImpactedData",
    "    itemId",
    "  }",
    "}",
  ];

  return lines.join("\n");
};

export const buildQuery = (
  operationName: string,
  fields: TemplateField[],
  previewData?: SchemaPreviewPayload,
) => {
  const lines = [
    "query {",
    `  get${operationName}(`,
    "    input: {",
    '      filter: "{}"',
    '      sort: "{}"',
    "      pageNo: 1",
    "      pageSize: 10",
    "    }",
    "  ) {",
    "    totalCount",
    "    totalPages",
    "    hasNextPage",
    "    hasPreviousPage",
    "    items {",
    ...formatSelectionFields(fields, previewData),
    "    }",
    "  }",
    "}",
  ];

  return lines.join("\n");
};

// ─── Template Section Builder ─────────────────────────────────────────────────

export const buildTemplateSections = ({
  schemaName,
  fields,
  schemaType,
  previewData,
}: {
  schemaName?: string;
  fields?: TemplateField[];
  schemaType?: number;
  previewData?: SchemaPreviewPayload;
}): TemplateSection[] => {
  const normalizedFields = normalizeTemplateFields(fields);
  const isEntity = schemaType === 1;

  const editableFields = isEntity
    ? normalizedFields.filter((field) => !isReadonlyField(field.name))
    : normalizedFields;

  return [
    {
      title: "Query",
      description: "Fetch data from the schema",
      code: buildQuery(`${schemaName}s`, normalizedFields, previewData),
    },
    {
      title: "Insert",
      description: "Add new entries to the schema",
      code: buildInsertMutation(schemaName as string, editableFields, previewData),
    },
    {
      title: "Update",
      description: "Modify existing entries",
      code: buildUpdateMutation(schemaName as string, editableFields, previewData),
    },
    {
      title: "Delete",
      description: "Remove entries from the schema",
      code: buildDeleteMutation(schemaName as string),
    },
  ];
};
