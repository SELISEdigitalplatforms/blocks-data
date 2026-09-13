import { describe, expect, it } from "vitest";

import { graphLogOutcome } from "./graph-log-history";

describe("graphLogOutcome", () => {
  it("shows successful requests as allowed", () => {
    expect(graphLogOutcome({ responseStatus: "success", failureKind: "" })).toBe("allowed");
  });

  it.each(["authentication", "authorization", "validation"])(
    "shows an explicit %s rejection as denied",
    (failureKind) => {
      expect(graphLogOutcome({ responseStatus: "failed", failureKind })).toBe("denied");
    },
  );

  it.each(["bad_request", "syntax_error", "unhandled", "unknown"])(
    "shows a %s failure as an error",
    (failureKind) => {
      expect(graphLogOutcome({ responseStatus: "failed", failureKind })).toBe("error");
    },
  );
});
