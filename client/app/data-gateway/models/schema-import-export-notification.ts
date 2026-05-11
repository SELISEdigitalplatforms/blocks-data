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
