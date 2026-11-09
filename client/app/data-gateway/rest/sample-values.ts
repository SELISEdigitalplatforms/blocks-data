import type { ShapeField } from "./entity-shape";

export const SAMPLE_TEXT = "Sample text";
export const SAMPLE_DATE_TIME = "2026-11-03T10:00:00Z";

function elementSample(field: ShapeField): unknown {
  switch (field.type.toLowerCase()) {
    case "string":
      return SAMPLE_TEXT;
    case "int":
    case "integer":
    case "long":
      return 1;
    case "float":
      return 1.5;
    case "boolean":
      return true;
    case "datetime":
      return SAMPLE_DATE_TIME;
    case "enum":
      return field.enumValues?.[0] ?? SAMPLE_TEXT;
    case "geojson":
      return { type: "Point", coordinates: [8.5417, 47.3769] };
    default:
      // A DTO: an object from its own fields; without children (cycle or depth limit) an empty object.
      return Object.fromEntries((field.children ?? []).map((c) => [c.name, sampleValue(c)]));
  }
}

/** A typed sample value for a field; arrays give a one-item array of the element sample. */
export function sampleValue(field: ShapeField): unknown {
  const element = elementSample(field);
  return field.isArray ? [element] : element;
}
