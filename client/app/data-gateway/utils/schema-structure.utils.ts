import { IField, ISchemaDetails } from "@/data-gateway/models/data-service";
import { createEmptyAccessRuleSet } from "./schema-normalization";
import { PREVIEW_TYPE_MAP } from "../models/schema-structure.types";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

/** Id of the built-in OperationAccess shape below; it is never fetched from the server. */
export const OPERATION_ACCESS_SCHEMA_ID = "builtin:OperationAccess";

const accessList = (name: string, descriptionKey: string): IField => ({
  name,
  type: "String",
  isArray: true,
  enumValues: [],
  isPIIData: false,
  isUniqueData: false,
  get description() { return tStatic(DATA_GATEWAY_SCHEMA_MODULE, descriptionKey); },
  requiredOn: "None",
});

/**
 * The type of the base entity's Create/Read/Update/Delete properties: who may do that to the record. It is a
 * platform type, not a project schema, so it has no schema of its own to load; this fixed shape lets those
 * properties expand like a child schema.
 */
export const OPERATION_ACCESS_SCHEMA: ISchemaDetails = {
  id: OPERATION_ACCESS_SCHEMA_ID,
  schemaName: "OperationAccess",
  schemaType: 2,
  collectionName: "",
  fields: [
    accessList("Roles", "SCHEMA_STRUCTURE_UTILS.ROLES_ALLOWED"),
    accessList("UserIds", "SCHEMA_STRUCTURE_UTILS.USERS_ALLOWED"),
    accessList("Permissions", "SCHEMA_STRUCTURE_UTILS.PERMISSIONS_ALLOWED"),
  ],
  totalPermissions: 0,
  totalRoles: 0,
  totalUsers: 0,
  readAccess: createEmptyAccessRuleSet(),
  writeAccess: createEmptyAccessRuleSet(),
  deleteAccess: createEmptyAccessRuleSet(),
  projectKey: "",
  isRlsEnabled: false,
  isClsEnabled: false,
  projectShortKey: "",
  totalSchemaReferences: 0,
  schemaReferences: [],
  readAccessLevel: 0,
  writeAccessLevel: 0,
  editAccessLevel: 0,
  deleteAccessLevel: 0,
};

/** The project's child schema of that name; OperationAccess when the project has none of its own. */
export const findChildSchemaByType = (
  schemaItems: ISchemaDetails[],
  type: string | undefined,
): ISchemaDetails | undefined => {
  const name = type?.trim().toLowerCase();
  return (
    schemaItems.find((s) => s.schemaName?.trim().toLowerCase() === name) ??
    (name === OPERATION_ACCESS_SCHEMA.schemaName.toLowerCase() ? OPERATION_ACCESS_SCHEMA : undefined)
  );
};

export const getPreviewFieldType = (type?: string) => {
  if (!type) {
    return "";
  }

  const normalized = type.trim();
  return PREVIEW_TYPE_MAP[normalized] ?? normalized.toLowerCase();
};
