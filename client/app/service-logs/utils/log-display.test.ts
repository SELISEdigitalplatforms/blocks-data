import { describe, expect, it } from "vitest";
import { LOG_LEVEL, getLogFormatTimestamp, getLogLevelClassName } from "./log-display";

describe("log-display utils", () => {
  // ─── LOG_LEVEL ─────────────────────────────────────────────────────────────
  describe("LOG_LEVEL", () => {
    it("exposes the three known log levels", () => {
      expect(LOG_LEVEL).toEqual({
        Information: "Information",
        Warning: "Warning",
        Error: "Error",
      });
    });
  });

  // ─── getLogFormatTimestamp ─────────────────────────────────────────────────
  describe("getLogFormatTimestamp", () => {
    it("formats a valid ISO timestamp as 'YYYY-MM-DD HH:MM:SS'", () => {
      // 2025-01-02T03:04:05.123Z -> ISO string, T->space, drop Z + last 4 chars (".123")
      expect(getLogFormatTimestamp("2025-01-02T03:04:05.123Z")).toBe("2025-01-02 03:04:05");
    });

    it("returns the original string when the timestamp is not a valid date", () => {
      expect(getLogFormatTimestamp("not-a-date")).toBe("not-a-date");
    });

    it("returns the original value for an empty string", () => {
      expect(getLogFormatTimestamp("")).toBe("");
    });
  });

  // ─── getLogLevelClassName ──────────────────────────────────────────────────
  describe("getLogLevelClassName", () => {
    it("maps Warning to text-warning", () => {
      expect(getLogLevelClassName("Warning")).toBe("text-warning");
    });

    it("maps Information to text-success", () => {
      expect(getLogLevelClassName("Information")).toBe("text-success");
    });

    it("maps Error to text-error", () => {
      expect(getLogLevelClassName("Error")).toBe("text-error");
    });

    it("falls back to text-high-emphasis for unknown levels", () => {
      expect(getLogLevelClassName("Debug")).toBe("text-high-emphasis");
      expect(getLogLevelClassName("")).toBe("text-high-emphasis");
    });
  });
});
