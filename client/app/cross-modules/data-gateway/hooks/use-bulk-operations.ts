import { useState, useCallback } from "react";
import { UseFieldArrayInsert, UseFieldArrayRemove, FieldArrayWithId } from "react-hook-form";
import { IField } from "../models/data-service";
import { PropertyRow } from "../models/schema-structure.types";
import { FieldAccessTarget } from "../models/schema-access.types";
import { sanitizeRuleSet } from "../utils/schema-access.utils";

interface UseBulkOperationsProps {
  fields: FieldArrayWithId<{ properties: IField[] }, "properties", "id">[];
  properties: PropertyRow[];
  insert: UseFieldArrayInsert<{ properties: IField[] }, "properties">;
  remove: UseFieldArrayRemove;
  readonlyPropertyNames: string[];
  schemaType?: number;
}

export const useBulkOperations = ({
  fields,
  properties,
  insert,
  remove,
  readonlyPropertyNames,
  schemaType,
}: UseBulkOperationsProps) => {
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [bulkAccessTargets, setBulkAccessTargets] = useState<FieldAccessTarget[] | null>(null);
  const [isBulkAccessDrawerOpen, setIsBulkAccessDrawerOpen] = useState(false);
  const [bulkAccessTitle, setBulkAccessTitle] = useState<string>("Manage access");
  const [selectedFieldNames, setSelectedFieldNames] = useState<string[]>([]);

  const selectedFieldEntries = fields
    .map((field, index) => ({ field, index, value: properties[index] }))
    .filter(({ field }) => selectedRows[field.id]);

  const hasSelectedRows = selectedFieldEntries.length > 0;

  const handleBulkDuplicate = useCallback(() => {
    const entriesToDuplicate = [...selectedFieldEntries]
      .filter(({ field, value, index }) => {
        const source = (value ?? field) as IField | undefined;
        const fieldName = source?.name?.trim() ?? "";
        const isReadOnlyField =
          schemaType === 1 &&
          index < readonlyPropertyNames.length &&
          readonlyPropertyNames.includes(fieldName);
        return !isReadOnlyField;
      })
      .sort((a, b) => b.index - a.index);

    entriesToDuplicate.forEach(({ field, value, index }) => {
      const source = (value ?? field) as IField & { id?: string };
      const { id: _omitId, ...fieldData } = source;
      insert(index + 1, { ...fieldData });
    });

    setSelectedRows({});
  }, [selectedFieldEntries, schemaType, readonlyPropertyNames, insert]);

  const handleBulkDelete = useCallback(() => {
    const indexesToRemove = selectedFieldEntries
      .filter(({ field, value, index }) => {
        const source = (value ?? field) as IField | undefined;
        const fieldName = source?.name?.trim() ?? "";
        const isReadOnlyField =
          schemaType === 1 &&
          index < readonlyPropertyNames.length &&
          readonlyPropertyNames.includes(fieldName);
        return !isReadOnlyField;
      })
      .map(({ index }) => index)
      .sort((a, b) => b - a);

    if (!indexesToRemove.length) {
      setSelectedRows({});
      return;
    }

    remove(indexesToRemove);
    setSelectedRows({});
  }, [selectedFieldEntries, schemaType, readonlyPropertyNames, remove]);

  const handleBulkManageAccess = useCallback(() => {
    if (!hasSelectedRows) {
      return;
    }

    const targets = selectedFieldEntries.reduce<FieldAccessTarget[]>((acc, { field, value }) => {
      const source = (value ?? (field as unknown as IField)) || undefined;
      const fieldName = source?.name?.trim();
      if (!fieldName) {
        return acc;
      }

      acc.push({
        name: fieldName,
        readAccess: source?.readAccess ? sanitizeRuleSet(source.readAccess) : undefined,
        writeAccess: source?.writeAccess ? sanitizeRuleSet(source.writeAccess) : undefined,
        deleteAccess: source?.deleteAccess ? sanitizeRuleSet(source.deleteAccess) : undefined,
      });

      return acc;
    }, []);

    if (!targets.length) {
      return;
    }

    const fieldNames = targets.map((target) => target.name);
    setSelectedFieldNames(fieldNames);
    setBulkAccessTargets(targets);
    setBulkAccessTitle(
      targets.length === 1
        ? `Access for ${targets[0].name}`
        : `Access for ${targets.length} fields`,
    );
    setIsBulkAccessDrawerOpen(true);
  }, [hasSelectedRows, selectedFieldEntries]);

  const clearSelection = useCallback(() => {
    setSelectedRows({});
  }, []);

  return {
    selectedRows,
    setSelectedRows,
    selectedFieldEntries,
    hasSelectedRows,
    handleBulkDuplicate,
    handleBulkDelete,
    handleBulkManageAccess,
    clearSelection,
    bulkAccessTargets,
    setBulkAccessTargets,
    isBulkAccessDrawerOpen,
    setIsBulkAccessDrawerOpen,
    bulkAccessTitle,
    setBulkAccessTitle,
    selectedFieldNames,
    setSelectedFieldNames,
  };
};
