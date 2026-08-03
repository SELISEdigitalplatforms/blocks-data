import { useMemo } from "react";
import { PropertyRow } from "../models/schema-structure.types";
import { getPreviewFieldType } from "../utils/schema-structure.utils";
import { buildPreviewJsonFromIntrospection } from "../utils/generate-preview-queries";

interface IntrospectionPreviewSource {
  rawIntrospection?: unknown;
  schemaName?: string;
}

export const useSchemaPreview = (
  properties: PropertyRow[],
  dtoPreviewMap: Map<string, Record<string, unknown>>,
  introspectionSource?: IntrospectionPreviewSource,
) => {
  const introspectionPreview = useMemo(() => {
    if (!introspectionSource?.rawIntrospection || !introspectionSource?.schemaName) {
      return null;
    }
    return buildPreviewJsonFromIntrospection(
      introspectionSource?.rawIntrospection,
      introspectionSource?.schemaName,
    );
  }, [introspectionSource?.rawIntrospection, introspectionSource?.schemaName]);

  const previewData = useMemo(() => {
    const structure: Record<string, unknown> = {};

    const safeProperties = Array.isArray(properties) ? properties : [];

    if (introspectionPreview) {
      safeProperties.forEach((property) => {
        const fieldName = property?.name?.trim();
        if (!fieldName) {
          return;
        }
        if (fieldName in introspectionPreview) {
          structure[fieldName] = introspectionPreview[fieldName];
          return;
        }

        const rawType = property?.type?.trim();
        const previewType = getPreviewFieldType(rawType);
        structure[fieldName] = property?.isArray ? [previewType || ""] : previewType || "";
      });
      return structure;
    }

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
  }, [dtoPreviewMap, properties, introspectionPreview]);

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