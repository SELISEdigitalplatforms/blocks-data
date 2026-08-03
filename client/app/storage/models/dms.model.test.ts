import { describe, expect, it } from "vitest";
import { DmsItem, NO_PERMISSIONS, isDirectory, resolveItemType } from "./dms.model";

describe("resolveItemType", () => {
  it("reads the type discriminator when the server sends one", () => {
    expect(resolveItemType({ type: "directory" })).toBe("directory");
    expect(resolveItemType({ type: "file" })).toBe("file");
  });

  it("falls back to typeString for payloads that predate the discriminator", () => {
    // The legacy listing shape carries only typeString, and its directory value is
    // "Directory" rather than "Directory".
    expect(resolveItemType({ typeString: "Directory" })).toBe("directory");
    expect(resolveItemType({ typeString: "File" })).toBe("file");
  });

  it("prefers type over typeString when both are present", () => {
    expect(resolveItemType({ type: "directory", typeString: "File" })).toBe("directory");
  });

  it("ignores casing", () => {
    expect(resolveItemType({ type: "DIRECTORY" })).toBe("directory");
    expect(resolveItemType({ typeString: "directory" })).toBe("directory");
  });

  it("treats an unknown or missing kind as a file", () => {
    // A directory rendered as a file is a broken link; a file rendered as a directory
    // would navigate into something that cannot be listed, so file is the safer
    // default for an unrecognised value.
    expect(resolveItemType({})).toBe("file");
    expect(resolveItemType({ type: "something-else" })).toBe("file");
  });
});

describe("isDirectory", () => {
  it("narrows a directory item", () => {
    const item = { type: "directory", childDirectoryCount: 2 } as DmsItem;

    expect(isDirectory(item)).toBe(true);
  });

  it("rejects a file item", () => {
    expect(isDirectory({ type: "file" } as DmsItem)).toBe(false);
  });
});

describe("NO_PERMISSIONS", () => {
  it("grants nothing beyond viewing", () => {
    // This stands in when a response carries no permissions at all. It has to be
    // read-only: assuming the caller can edit would show actions the server will
    // then refuse, and worse, imply an access level they do not have.
    expect(NO_PERMISSIONS.canView).toBe(true);
    expect(NO_PERMISSIONS.canDownload).toBe(false);
    expect(NO_PERMISSIONS.canEdit).toBe(false);
    expect(NO_PERMISSIONS.canDelete).toBe(false);
    expect(NO_PERMISSIONS.canManage).toBe(false);
    expect(NO_PERMISSIONS.canOwner).toBe(false);
  });
});
