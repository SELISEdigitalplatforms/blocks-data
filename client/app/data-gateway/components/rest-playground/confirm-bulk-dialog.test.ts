import { describe, expect, it } from "vitest";
import type { RestMethod } from "../../rest/request-templates";
import { needsConfirm } from "./confirm-bulk-dialog";

const req = (method: RestMethod, path: string, query: [string, string][] = []) => ({ method, path, query });

describe("needsConfirm", () => {
  it("names bulk updates, bulk deletes and hard deletes", () => {
    expect(needsConfirm(req("POST", "/E:updateMany"))).toBe("bulk-update");
    expect(needsConfirm(req("POST", "/E:deleteMany"))).toBe("bulk-delete");
    expect(needsConfirm(req("POST", "/E:deleteMany", [["hardDelete", "true"]]))).toBe("bulk-hard-delete");
    expect(needsConfirm(req("DELETE", "/E/1", [["hardDelete", "true"]]))).toBe("hard-delete");
    expect(needsConfirm(req("DELETE", "/E/1", [["hardDelete", "TRUE"]]))).toBe("hard-delete");
    expect(needsConfirm(req("DELETE", "/E/1", [["HardDelete", " True "]]))).toBe("hard-delete");
  });

  it("fails closed: an encoded colon still asks", () => {
    expect(needsConfirm(req("POST", "/E%3AdeleteMany"))).toBe("bulk-delete");
    expect(needsConfirm(req("POST", "/E%3adeleteMany", [["hardDelete", "true"]]))).toBe("bulk-hard-delete");
    expect(needsConfirm(req("POST", "/E%3AupdateMany"))).toBe("bulk-update");
  });

  it("fails closed: every casing of the verb still asks, though the server would refuse it", () => {
    expect(needsConfirm(req("POST", "/E:DELETEMANY"))).toBe("bulk-delete");
    expect(needsConfirm(req("POST", "/E:DeleteMany", [["hardDelete", "true"]]))).toBe("bulk-hard-delete");
    expect(needsConfirm(req("POST", "/E:updatemany"))).toBe("bulk-update");
    expect(needsConfirm(req("POST", "/E%3A%55pdateMany"))).toBe("bulk-update");
    expect(needsConfirm(req("POST", "/E:deleteMany/"))).toBe("bulk-delete");
  });

  it("fails closed: a POST with an extra colon in the first segment asks as a bulk delete", () => {
    expect(needsConfirm(req("POST", "/E:x:deleteMany"))).toBe("bulk-delete");
  });

  it("does not ask for DELETE on a :deleteMany path, which the server answers 405", () => {
    expect(needsConfirm(req("DELETE", "/E:deleteMany"))).toBeNull();
  });

  it("fails closed: a POST whose first segment does not decode asks as a bulk delete", () => {
    expect(needsConfirm(req("POST", "/E%3A%zz"))).toBe("bulk-delete");
    expect(needsConfirm(req("POST", "/E%3A%E0%A4%A", [["hardDelete", "true"]]))).toBe("bulk-hard-delete");
  });

  // The server's bool parse also trims "\0" and every char.IsWhiteSpace character (U+0085 and so on) that a JS trim()
  // keeps, so hardDelete is hard unless it is blank or exactly "false" (R-V2-15). "1" is refused by the server anyway.
  it.each([
    ["true + NUL", "true\u0000", true],
    ["true + U+0085", "true\u0085", true],
    ["TRUE", "TRUE", true],
    ["1", "1", true],
    ["false", "false", false],
    ["' false '", " false ", false],
    ["empty", "", false],
  ])("fails closed: hardDelete=%s is hard: %s", (_label, value, hard) => {
    expect(needsConfirm(req("DELETE", "/E/1", [["hardDelete", value]]))).toBe(hard ? "hard-delete" : null);
    expect(needsConfirm(req("POST", "/E:deleteMany", [["hardDelete", value]]))).toBe(
      hard ? "bulk-hard-delete" : "bulk-delete",
    );
  });

  it("counts hardDelete=true only on DELETE and :deleteMany", () => {
    expect(needsConfirm(req("GET", "/E", [["hardDelete", "true"]]))).toBeNull();
    expect(needsConfirm(req("GET", "/E/1", [["hardDelete", "true"]]))).toBeNull();
    expect(needsConfirm(req("PATCH", "/E/1", [["hardDelete", "true"]]))).toBeNull();
    expect(needsConfirm(req("POST", "/E", [["hardDelete", "true"]]))).toBeNull();
    expect(needsConfirm(req("POST", "/E:updateMany", [["hardDelete", "true"]]))).toBe("bulk-update");
  });

  it("lets everything else through", () => {
    expect(needsConfirm(req("POST", "/E"))).toBeNull();
    expect(needsConfirm(req("DELETE", "/E/1"))).toBeNull();
    expect(needsConfirm(req("DELETE", "/E/1", [["hardDelete", "false"]]))).toBeNull();
    expect(needsConfirm(req("POST", "/E:query"))).toBeNull();
    expect(needsConfirm(req("POST", "/E:insertMany"))).toBeNull();
    expect(needsConfirm(req("POST", "/E:deleteManyx"))).toBeNull();
    expect(needsConfirm(req("POST", "/E/deleteMany"))).toBeNull();
    expect(needsConfirm(req("PATCH", "/E/1"))).toBeNull();
    expect(needsConfirm(req("PUT", "/E/1"))).toBeNull();
    expect(needsConfirm(req("GET", "/E"))).toBeNull();
    expect(needsConfirm(req("GET", "/E:deleteMany"))).toBeNull();
  });
});
