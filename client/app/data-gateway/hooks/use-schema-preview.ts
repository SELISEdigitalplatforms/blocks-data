import { useMemo } from "react";
import { PropertyRow } from "../models/schema-structure.types";
import { getPreviewFieldType } from "../utils/schema-structure.utils";

export const useSchemaPreview = (
  properties: PropertyRow[],
  dtoPreviewMap: Map<string, Record<string, unknown>>,
) => {
  const previewData = useMemo(() => {
    const structure: Record<string, unknown> = {};

    const safeProperties = Array.isArray(properties) ? properties : [];

    safeProperties.forEach((property) => {
      const fieldName = property?.name?.trim();
      if (!fieldName) {
        return;
      }

      const rawType = property?.type?.trim();

      if (rawType) {
        const dtoFields = dtoPreviewMap.get(rawType);
        if (dtoFields) {
          const nestedPreview = JSON.parse(JSON.stringify(dtoFields));
          structure[fieldName] = property?.isArray ? [nestedPreview] : nestedPreview;
          return;
        }
      }

      const previewType = getPreviewFieldType(rawType);
      const previewValue = property?.isArray ? [previewType || ""] : previewType || "";
      structure[fieldName] = previewValue;
    });

    return structure;
  }, [dtoPreviewMap, properties]);

  const templateFields = useMemo(
    () =>
      (Array.isArray(properties) ? properties : []).map((property) => ({
        name: property?.name ?? "",
        type: property?.type ?? undefined,
        isArray: Boolean(property?.isArray),
        isPIIData: Boolean(property?.isPIIData),
        isUniqueData: Boolean(property?.isUniqueData),
      })),
    [properties],
  );

  return { previewData, templateFields };
};
