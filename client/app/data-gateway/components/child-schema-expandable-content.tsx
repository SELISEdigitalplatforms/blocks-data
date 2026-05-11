"use client";

import { useEffect, useState } from "react";
import { useSchemaDetails } from "../hooks/use-configuration";
import { ISchemaDetails } from "../models/data-service";
import {
  createEmptyAccessRuleSet,
  mergeFieldsWithParentData,
  normalizeAccessRuleSet,
  normalizeSchemaFields,
} from "../utils/schema-normalization";
import SchemaStructureTable from "./schema-structure";

const createEmptySchemaDetails = (projectKey: string): ISchemaDetails => ({
  id: "",
  schemaName: "",
  schemaType: 0,
  collectionName: "",
  fields: [],
  totalPermissions: 0,
  totalRoles: 0,
  totalUsers: 0,
  readAccess: createEmptyAccessRuleSet(),
  writeAccess: createEmptyAccessRuleSet(),
  deleteAccess: createEmptyAccessRuleSet(),
  projectKey,
  isRlsEnabled: false,
  isClsEnabled: false,
  projectShortKey: "",
  totalSchemaReferences: 0,
  schemaReferences: [],
  readAccessLevel: 1,
  writeAccessLevel: 1,
  editAccessLevel: 1,
  deleteAccessLevel: 1,
});

/** Parent entity field shape when merging nested validation/access into a child schema table. */
export type ParentFieldWithNestedPayload = {
  fields?: Array<{
    name: string;
    validationRule?: unknown;
    totalValidationRules?: number;
    readAccessLevel?: number;
    writeAccessLevel?: number;
    editAccessLevel?: number;
    deleteAccessLevel?: number;
  }>;
};

interface ChildSchemaExpandableContentProps {
  schemaId: string;
  projectKey: string;
  /** Root schema ID for validation API (top-level schema being edited) */
  rootSchemaId?: string;
  /** Ancestor path for multi-level nesting (e.g. ["B", "C"] for A.B.C.password) */
  ancestorPath?: string[];
  /** Parent schema ID (for backward compat) */
  parentSchemaId?: string;
  /** Parent property name when nested (e.g. "Assignee") */
  parentPropertyName?: string;
  /** Parent field with nested fields from API (for validation display + access levels) */
  parentFieldWithNested?: ParentFieldWithNestedPayload;
  /** When true, the Access | Validation column is hidden (used when parent is Child tab) */
  hideAccessValidation?: boolean;
  /** Root entity schema name for policy APIs when this table is embedded under a parent */
  policyEntitySchemaName?: string;
  onOpenStandaloneSchemaEditor?: (schemaId: string) => void;
}

export function ChildSchemaExpandableContent({
  schemaId,
  projectKey,
  rootSchemaId,
  ancestorPath,
  parentSchemaId,
  parentPropertyName,
  parentFieldWithNested,
  hideAccessValidation,
  policyEntitySchemaName,
  onOpenStandaloneSchemaEditor,
}: ChildSchemaExpandableContentProps) {
  const [schemaDetails, setSchemaDetails] = useState<ISchemaDetails>(() =>
    createEmptySchemaDetails(projectKey),
  );
  const { data: schemaDetailsQuery, isLoading } = useSchemaDetails(schemaId, projectKey);

  useEffect(() => {
    if (schemaDetailsQuery?.data) {
      const res = schemaDetailsQuery.data;
      setSchemaDetails({
        id: res.id,
        schemaName: res.schemaName,
        schemaType: res.schemaType,
        collectionName: res.collectionName,
        fields: normalizeSchemaFields(res.fields),
        totalPermissions: res.totalPermissions,
        totalUsers: res.totalUsers,
        totalRoles: res.totalRoles,
        readAccess: normalizeAccessRuleSet(res.readAccess),
        writeAccess: normalizeAccessRuleSet(res.writeAccess),
        deleteAccess: normalizeAccessRuleSet(res.deleteAccess),
        projectKey: res.projectKey ?? projectKey,
        isRlsEnabled: res.isRlsEnabled ?? false,
        isClsEnabled: res.isClsEnabled ?? false,
        projectShortKey: res.projectShortKey,
        totalSchemaReferences: res.totalSchemaReferences,
        schemaReferences: res.schemaReferences,
        readAccessLevel: res.readAccessLevel,
        writeAccessLevel: res.writeAccessLevel,
        editAccessLevel: res.editAccessLevel,
        deleteAccessLevel: res.deleteAccessLevel,
      });
    }
  }, [schemaDetailsQuery, projectKey]);

  const fieldsWithParentValidation = mergeFieldsWithParentData(
    schemaDetails.fields ?? [],
    parentFieldWithNested?.fields,
  );

  const resolvedAncestorPath = ancestorPath ?? (parentPropertyName ? [parentPropertyName] : []);

  return (
    <div className="min-w-0 max-w-full bg-muted/20">
      <SchemaStructureTable
        {...schemaDetails}
        fields={fieldsWithParentValidation}
        isLoading={isLoading}
        compactView
        rootSchemaId={rootSchemaId ?? parentSchemaId}
        ancestorPath={resolvedAncestorPath}
        hideAccessValidation={hideAccessValidation}
        policyEntitySchemaName={policyEntitySchemaName ?? schemaDetails.schemaName}
        onOpenStandaloneSchemaEditor={onOpenStandaloneSchemaEditor}
      />
    </div>
  );
}
