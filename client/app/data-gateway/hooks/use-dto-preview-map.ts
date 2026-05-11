import { useMemo, useRef, useState } from "react";
import { debounce } from "@/lib/utils";
import { useSchemaList } from "./use-configuration";
import { ISchemaDetails, IField } from "../models/data-service";
import { getPreviewFieldType } from "../utils/schema-structure.utils";

export const useDtoPreviewMap = (projectKey: string) => {
  const [searchText, setSearchTextState] = useState("");
  const debouncedSetSearchText = useRef(debounce(setSearchTextState, 300)).current;

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
      // Prevent infinite recursion (max depth 10 levels)
      if (depth > 10) {
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
          // Recursively build nested DTO structure
          const nestedStructure = buildDtoStructure(
            fieldTypeName,
            new Set(visited), // Pass a copy to avoid side effects
            depth + 1,
          );

          if (nestedStructure) {
            // If it's an array of DTOs, wrap in array
            dtoFields[field.name] = field.isArray ? [nestedStructure] : nestedStructure;
          } else {
            // Fallback to primitive type if recursion fails
            const fieldType = getPreviewFieldType(field.type);
            dtoFields[field.name] = field.isArray ? [fieldType || ""] : fieldType || "";
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
