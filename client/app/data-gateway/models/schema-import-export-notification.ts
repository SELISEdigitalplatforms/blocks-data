/** Schema import REST payload after file upload / correlation (UILM-aligned shape). */
export interface IImportFile {
  messageCoRelationId: string;
  fileId: string;
  projectKey: string;
}

/**
 * SignalR / notifier envelope for schema export completion (same denormalized shape as UILM export).
 */
export interface ISchemaExportNotificationData {
  message: {
    denormalizedPayload:
      | string
      | {
          Message?: Record<string, unknown>;
        };
  };
}

/**
 * Denormalized payload of the `schema-import` notification sent when the Worker finishes an import.
 * `Errors` holds the import validator's messages on a validation failure and is empty otherwise;
 * `CorrelationId` is the import request's correlation id. Older servers send neither.
 */
export interface ISchemaImportNotificationPayload {
  IsSuccess: boolean;
  FileId?: string;
  ImportedSchemaCount?: number;
  Errors?: string[];
  CorrelationId?: string;
}
