import { ISchemaDetails } from "@/cross-modules/data-gateway/models/data-service";
import { PREVIEW_TYPE_MAP } from "../models/schema-structure.types";

export const findChildSchemaByType = (
  schemaItems: ISchemaDetails[],
  type: string | undefined,
): ISchemaDetails | undefined =>
  schemaItems.find(
    (s) => s.schemaName?.trim().toLowerCase() === type?.trim().toLowerCase(),
  );

export const getPreviewFieldType = (type?: string) => {
  if (!type) {
    return "";
  }

  const normalized = type.trim();
  return PREVIEW_TYPE_MAP[normalized] ?? normalized.toLowerCase();
};
