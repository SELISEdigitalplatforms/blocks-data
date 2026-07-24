import { describe, expect, it } from "vitest";
import {
  REGISTER_SERVICE_TYPE,
  REGISTER_SERVICE_TYPES,
  REGISTER_SERVICE_ENVIRONMENTS,
  LOG_LEVELS,
  SERVICE_STATUS,
  TRACE_STATUS,
} from "./index";

describe("identifier constants", () => {
  it("maps the service type enum to labelled options", () => {
    expect(REGISTER_SERVICE_TYPE.None).toBe(0);
    expect(REGISTER_SERVICE_TYPE.Api).toBe(1);
    expect(REGISTER_SERVICE_TYPE.Worker).toBe(2);
    expect(REGISTER_SERVICE_TYPES).toHaveLength(3);
    expect(REGISTER_SERVICE_TYPES[1]).toEqual({
      value: REGISTER_SERVICE_TYPE.Api,
      label: "API",
    });
  });

  it("exposes environment, log level and status catalogues", () => {
    expect(REGISTER_SERVICE_ENVIRONMENTS.map((e) => e.value)).toEqual([
      "prod",
      "stg",
      "dev",
    ]);
    expect(LOG_LEVELS).toHaveLength(5);
    expect(LOG_LEVELS.find((l) => l.value === "error")?.color).toBe(
      "bg-red-500",
    );
    expect(SERVICE_STATUS.find((s) => s.value === "active")?.label).toBe(
      "Active",
    );
    expect(TRACE_STATUS.find((s) => s.value === "timeout")?.label).toBe(
      "Timeout",
    );
  });
});
