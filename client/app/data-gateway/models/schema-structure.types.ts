import { IDataAccessRuleSet, RequiredOn } from "./data-service";

export type PropertyRow = {
  name: string;
  type: string;
  isArray: boolean;
  isPIIData?: boolean;
  isUniqueData?: boolean;
  description?: string;
  requiredOn?: RequiredOn;
  totalRoles?: number;
  totalUsers?: number;
  totalPermissions?: number;
  totalValidationRules?: number;
  readAccess?: IDataAccessRuleSet;
  writeAccess?: IDataAccessRuleSet;
  deleteAccess?: IDataAccessRuleSet;
};

export const defaultProperty: PropertyRow = {
  name: "",
  type: "String",
  isArray: false,
  isPIIData: false,
  isUniqueData: false,
  description: "",
  requiredOn: "None",
  totalRoles: 0,
  totalUsers: 0,
  totalPermissions: 0,
  totalValidationRules: 0,
};

export const PREVIEW_TYPE_MAP: Record<string, string> = {
  String: "string",
  Int: "integer",
  Long: "long",
  Float: "float",
  Boolean: "boolean",
  DateTime: "datetime",
};

