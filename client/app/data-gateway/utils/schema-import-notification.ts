import { showErrorToast } from "@/hooks/use-toast";
import { tStatic } from "@seliseblocks/genesis-os/i18n";
import { NotificationData } from "../models/deployment-notification";
import { ISchemaImportNotificationPayload } from "../models/schema-import-export-notification";

const DATA_GATEWAY_SCHEMA_MODULE = "data.gateway.schema";

/**
 * Keys of failed-import notifications already shown. Both the schemas sidebar and the security page
 * listen for `schema-import`, and both can be mounted at once, so the first listener to handle a
 * notification shows its toast and the other skips it.
 */
const handledImportNotifications = new Set<string>();

/** Forgets every handled notification. For tests, which mount the listeners again and again. */
export const resetHandledImportNotifications = (): void => {
  handledImportNotifications.clear();
};

/**
 * The `schema-import` payload of a notification, or null when it has none. The payload arrives as a
 * JSON string or an object, possibly wrapped in `Message`. Throws on a payload that is not valid JSON;
 * each listener reports that with its own text, as before.
 */
export const parseSchemaImportNotification = (
  notificationData: NotificationData | undefined,
): ISchemaImportNotificationPayload | null => {
  const payload = notificationData?.message?.denormalizedPayload;
  if (!payload) return null;
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  return (parsed?.Message ?? parsed) as ISchemaImportNotificationPayload;
};

/**
 * Shows one error toast per failed import, keyed by `CorrelationId` (else `FileId`). With validation
 * messages it lists them under "Schema import failed:"; without them it shows the generic import error.
 */
export const showSchemaImportFailure = (payload: ISchemaImportNotificationPayload): void => {
  const key = payload.CorrelationId || payload.FileId;
  if (key) {
    if (handledImportNotifications.has(key)) return;
    handledImportNotifications.add(key);
  }

  const errors = (payload.Errors ?? []).filter((error) => typeof error === "string" && error.length > 0);
  if (errors.length > 0) {
    showErrorToast({
      title: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "SCHEMA_IMPORT.FAILED_WITH_REASONS"),
      errors,
    });
    return;
  }
  showErrorToast({
    errors: tStatic(DATA_GATEWAY_SCHEMA_MODULE, "SECURITY_AND_PERFORMANCE.ERROR_PROCESSING_IMPORT_SCHEMA"),
  });
};
