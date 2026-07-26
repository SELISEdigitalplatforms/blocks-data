/**
 * Schema Preview Types and Enums
 * Used by schema-preview-drawer component for generating GraphQL templates
 */

import { ReactNode } from "react";

export type SchemaPreviewPayload = Record<string, unknown> & {
  SchemaName?: string;
};

export type TemplateField = {
  name: string;
  type?: string | null;
  isArray?: boolean | null;
};

export type TemplateSection = {
  title: string;
  description: string;
  code: string;
};

export type SchemaPreviewDrawerProps = {
  trigger?: ReactNode;
  previewData: SchemaPreviewPayload;
  schemaName?: string;
  schemaType?: number;
  fields?: TemplateField[];
  title?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  projectShortKey?: string;
  rawIntrospection?: unknown;
  isGatewayIntrospectionPending?: boolean;
  isGatewayIntrospectionFetching?: boolean;
};

/**
 * Supported field types for schema definitions
 */
export enum FieldType {
  String = "string",
  Int = "int",
  Integer = "integer",
  Long = "long",
  Float = "float",
  Boolean = "boolean",
  DateTime = "datetime",
}

/**
 * Sample GraphQL values for each field type
 * Used in mutation/query template generation
 */
export const SAMPLE_VALUE_BY_TYPE: Record<string, string> = {
  [FieldType.String]: '"Sample text"',
  [FieldType.Int]: "1",
  [FieldType.Integer]: "1",
  [FieldType.Long]: "1",
  [FieldType.Float]: "1.0",
  [FieldType.Boolean]: "true",
  [FieldType.DateTime]: '"2024-01-01T00:00:00Z"',
};

// Props for the component
export type AccessControlLevel = "row" | "column";

export interface SchemaAccessControlViewProps {
  schemaFields?: { name: string; type?: string | null; isArray?: boolean | null }[];
  schemaName: string;
  schemaId: string;
  level: AccessControlLevel;
  operation: number;
  fieldNames: string[];
  defaultAccessLevel?: number;
}

export interface FormValues {
  name: string;
  choice: string;
}
