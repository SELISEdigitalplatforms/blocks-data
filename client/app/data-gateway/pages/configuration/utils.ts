import { z } from "zod";
import type { IDataSourceResponse, IDataSourceSavePayload } from "../../models/data-service";

/** Sentinel the server treats as "use the tenant's own Blocks database". */
export const DEFAULT_DATA_SOURCE_VALUE = "default";
export const DEFAULT_COLLECTION_NAME_PATTERN = "sb_{SchemaName}s";
export const SCHEMA_NAME_PLACEHOLDER = "{SchemaName}";

export type DataSourceKind = "blocks" | "others";

export const dataSourceFormSchema = z.object({
  connectionString: z.string().trim(),
  databaseName: z.string().trim(),
  isCollectionNameEditable: z.boolean(),
  collectionNamePattern: z
    .string()
    .trim()
    .nonempty("Collection name pattern is required")
    .refine((v) => v.includes(SCHEMA_NAME_PLACEHOLDER), "Pattern must contain {SchemaName}"),
  enableAnalytics: z.boolean(),
});

export type DataSourceFormValues = z.infer<typeof dataSourceFormSchema>;

export const dataSourceFormDefaultValues: DataSourceFormValues = {
  connectionString: "",
  databaseName: "",
  isCollectionNameEditable: false,
  collectionNamePattern: DEFAULT_COLLECTION_NAME_PATTERN,
  enableAnalytics: false,
};

export const isCustomSource = (configuration?: IDataSourceResponse | null) =>
  configuration?.connectionType === "Custom";

/**
 * The server never returns the connection string, so it is always empty here. The database
 * name is only shown for an own-DB config.
 */
export function toFormValues(configuration?: IDataSourceResponse | null): DataSourceFormValues {
  if (!configuration) return dataSourceFormDefaultValues;
  return {
    connectionString: "",
    databaseName: isCustomSource(configuration) ? configuration.databaseName : "",
    isCollectionNameEditable: configuration.isCollectionNameEditable ?? false,
    collectionNamePattern: configuration.collectionNamePattern || DEFAULT_COLLECTION_NAME_PATTERN,
    enableAnalytics: configuration.analyticsConfiguration?.enableAnalytics ?? false,
  };
}

/** An own-DB config is already saved, so an empty connection string means "keep it". */
export const canKeepSecret = (configuration?: IDataSourceResponse | null) =>
  isCustomSource(configuration);

/**
 * Own DB needs a database name. It needs the connection string too, except when an own-DB
 * config is already saved and stays own-DB (empty = keep the saved secret).
 * Returns a message per missing field, or an empty object when the form can be saved.
 */
export function validateSource(
  kind: DataSourceKind,
  values: Pick<DataSourceFormValues, "connectionString" | "databaseName">,
  keepSecretAllowed = false,
): Partial<Record<"connectionString" | "databaseName", string>> {
  if (kind === "blocks") return {};
  const errors: Partial<Record<"connectionString" | "databaseName", string>> = {};
  if (!values.connectionString.trim() && !keepSecretAllowed)
    errors.connectionString = "Connection string is required";
  if (!values.databaseName.trim()) errors.databaseName = "Database name is required";
  return errors;
}

/**
 * Blocks DB sends "default" for both; own DB sends the entered plain string. Own DB with an empty
 * string on an existing own-DB config omits the field (the server keeps the saved secret).
 */
export function buildSavePayload(
  kind: DataSourceKind,
  values: DataSourceFormValues,
  configuration: IDataSourceResponse | undefined,
  projectKey: string,
): IDataSourceSavePayload {
  const own = kind === "others";
  const entered = values.connectionString.trim();
  const connectionString = own ? entered : DEFAULT_DATA_SOURCE_VALUE;
  return {
    ...(configuration && { itemId: configuration.itemId ?? configuration.ItemId }),
    ...(connectionString || !canKeepSecret(configuration) ? { connectionString } : {}),
    databaseName: own ? values.databaseName.trim() : DEFAULT_DATA_SOURCE_VALUE,
    projectKey: configuration?.projectKey || projectKey,
    isCollectionNameEditable: values.isCollectionNameEditable,
    collectionNamePattern: values.collectionNamePattern,
    enableAnalytics: values.enableAnalytics,
  };
}
