import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import {
  parseSchemaImportNotification,
  resetHandledImportNotifications,
  showSchemaImportFailure,
} from "./schema-import-notification";

const REASON = "Document[0]: CollectionName 'sb_Orders' is already used by schema 'Order'.";

describe("schema-import notification handling", () => {
  beforeEach(() => {
    showErrorToast.mockReset();
    resetHandledImportNotifications();
  });

  describe("parseSchemaImportNotification", () => {
    it("reads a JSON string payload, unwrapping Message", () => {
      const parsed = parseSchemaImportNotification({
        message: { denormalizedPayload: JSON.stringify({ Message: { IsSuccess: false, CorrelationId: "c1" } }) },
      } as never);
      expect(parsed).toEqual({ IsSuccess: false, CorrelationId: "c1" });
    });

    it("reads an object payload as it is", () => {
      const parsed = parseSchemaImportNotification({
        message: { denormalizedPayload: { IsSuccess: true, Errors: [] } },
      } as never);
      expect(parsed).toEqual({ IsSuccess: true, Errors: [] });
    });

    it("returns null without a payload", () => {
      expect(parseSchemaImportNotification({ message: {} } as never)).toBeNull();
      expect(parseSchemaImportNotification(undefined)).toBeNull();
    });

    it("throws on a payload that is not JSON, so the listener reports it", () => {
      expect(() => parseSchemaImportNotification({ message: { denormalizedPayload: "{not-json" } } as never)).toThrow();
    });
  });

  describe("showSchemaImportFailure", () => {
    it("lists every validation message under the failed-import title", () => {
      showSchemaImportFailure({ IsSuccess: false, CorrelationId: "c1", Errors: [REASON, "Document[2]: second"] });

      expect(showErrorToast).toHaveBeenCalledWith({
        title: "Schema import failed:",
        errors: [REASON, "Document[2]: second"],
      });
    });

    it("shows the generic import error when there are no messages", () => {
      showSchemaImportFailure({ IsSuccess: false, CorrelationId: "c1", Errors: [] });
      showSchemaImportFailure({ IsSuccess: false, CorrelationId: "c2" });

      expect(showErrorToast).toHaveBeenCalledTimes(2);
      expect(showErrorToast).toHaveBeenNthCalledWith(1, { errors: "Error processing import schema" });
      expect(showErrorToast).toHaveBeenNthCalledWith(2, { errors: "Error processing import schema" });
    });

    it("shows a notification once per CorrelationId", () => {
      showSchemaImportFailure({ IsSuccess: false, CorrelationId: "c1", FileId: "f1", Errors: [REASON] });
      showSchemaImportFailure({ IsSuccess: false, CorrelationId: "c1", FileId: "f1", Errors: [REASON] });
      showSchemaImportFailure({ IsSuccess: false, CorrelationId: "c2", FileId: "f1", Errors: [REASON] });

      expect(showErrorToast).toHaveBeenCalledTimes(2);
    });

    it("falls back to FileId when CorrelationId is missing", () => {
      showSchemaImportFailure({ IsSuccess: false, FileId: "f1", Errors: [REASON] });
      showSchemaImportFailure({ IsSuccess: false, FileId: "f1", Errors: [REASON] });
      showSchemaImportFailure({ IsSuccess: false, FileId: "f2", Errors: [REASON] });

      expect(showErrorToast).toHaveBeenCalledTimes(2);
    });

    it("forgets handled notifications on reset", () => {
      showSchemaImportFailure({ IsSuccess: false, CorrelationId: "c1", Errors: [REASON] });
      resetHandledImportNotifications();
      showSchemaImportFailure({ IsSuccess: false, CorrelationId: "c1", Errors: [REASON] });

      expect(showErrorToast).toHaveBeenCalledTimes(2);
    });
  });
});
