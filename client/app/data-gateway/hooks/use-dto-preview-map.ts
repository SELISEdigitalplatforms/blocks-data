import { useEffect, useMemo, useState } from "react";
import { debounce } from "@/lib/utils";
import { useSchemaList } from "./use-configuration";
import { ISchemaDetails, IField } from "../models/data-service";
import { getPreviewFieldType } from "../utils/schema-structure.utils";

const MAX_NESTING_DEPTH = 30;

export const useDtoPreviewMap = (projectKey: string) => {
  const [searchText, setSearchTextState] = useState("");
  const [debouncedSetSearchText] = useState(() => debounce(setSearchTextState, 300));

  useEffect(
    () => () => {
      debouncedSetSearchText.cancel();
    },
    [debouncedSetSearchText],
  );

  const { data: schemaListQuery } = useSchemaList({
    keyword: searchText,
    projectKey,
    pageNo: 1,
    pageSize: 100,
  });

  const schemaItems = useMemo(
    () =>
      schemaListQuery?.data?.items?.filter((item: ISchemaDetails) => item.schemaType === 2) ?? [],
    [schemaListQuery],
  );

  const dtoPreviewMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();

    // First pass: Create a map of schema names to their schema details
    const schemaByName = new Map<string, ISchemaDetails>();
    schemaItems.forEach((item) => {
      if (item?.schemaName) {
        schemaByName.set(item.schemaName.trim(), item);
      }
    });

    // Recursively builds nested DTO structure for multi-level type resolution.

    const buildDtoStructure = (
      schemaName: string,
      visited: Set<string> = new Set(),
      depth: number = 0,
    ): Record<string, unknown> | null => {
      if (depth >= MAX_NESTING_DEPTH) {
        return null;
      }

      // Prevent circular references
      if (visited.has(schemaName)) {
        return null;
      }

      const schema = schemaByName.get(schemaName);
      if (!schema) {
        return null;
      }

      visited.add(schemaName);
      const dtoFields: Record<string, unknown> = {};

      (schema.fields ?? []).forEach((field: IField) => {
        if (!field?.name) {
          return;
        }

        const fieldTypeName = field.type?.trim();

        // Check if this field type is another DTO
        if (fieldTypeName && schemaByName.has(fieldTypeName)) {
          // A finite query/input cannot expand a circular DTO edge. Omit only
          // that edge while preserving every acyclic level of the structure.
          if (visited.has(fieldTypeName)) {
            return;
          }

          // Recursively build nested DTO structure
          const nestedStructure = buildDtoStructure(
            fieldTypeName,
            new Set(visited), // Pass a copy to avoid side effects
            depth + 1,
          );

          if (nestedStructure) {
            // If it's an array of DTOs, wrap in array
            dtoFields[field.name] = field.isArray ? [nestedStructure] : nestedStructure;
          }
        } else {
          // It's a primitive type
          const fieldType = getPreviewFieldType(field.type);
          dtoFields[field.name] = field.isArray ? [fieldType || ""] : fieldType || "";
        }
      });

      visited.delete(schemaName);
      return dtoFields;
    };

    // Build the map with recursive resolution
    schemaItems.forEach((item) => {
      if (!item?.schemaName) {
        return;
      }

      const schemaName = item.schemaName.trim();
      const structure = buildDtoStructure(schemaName);

      if (structure) {
        map.set(schemaName, structure);
      }
    });

    return map;
  }, [schemaItems]);

  return {
    searchText,
    setSearchText: setSearchTextState,
    debouncedSetSearchText,
    schemaItems,
    dtoPreviewMap,
  };
};
