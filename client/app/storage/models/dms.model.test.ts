import { describe, expect, it } from "vitest";
import { DmsItem, NO_PERMISSIONS, isFolder, resolveItemType } from "./dms.model";

describe("resolveItemType", () => {
  it("reads the type discriminator when the server sends one", () => {
    expect(resolveItemType({ type: "folder" })).toBe("folder");
    expect(resolveItemType({ type: "file" })).toBe("file");
  });

  it("falls back to typeString for payloads that predate the discriminator", () => {
    // The legacy listing shape carries only typeString, and its folder value is
    // "Directory" rather than "Folder".
    expect(resolveItemType({ typeString: "Directory" })).toBe("folder");
    expect(resolveItemType({ typeString: "File" })).toBe("file");
  });

  it("prefers type over typeString when both are present", () => {
    expect(resolveItemType({ type: "folder", typeString: "File" })).toBe("folder");
  });

  it("ignores casing", () => {
    expect(resolveItemType({ type: "FOLDER" })).toBe("folder");
    expect(resolveItemType({ typeString: "directory" })).toBe("folder");
  });

  it("treats an unknown or missing kind as a file", () => {
    // A folder rendered as a file is a broken link; a file rendered as a folder
    // would navigate into something that cannot be listed, so file is the safer
    // default for an unrecognised value.
    expect(resolveItemType({})).toBe("file");
    expect(resolveItemType({ type: "something-else" })).toBe("file");
  });
});

describe("isFolder", () => {
  it("narrows a folder item", () => {
    const item = { type: "folder", childFolderCount: 2 } as DmsItem;

    expect(isFolder(item)).toBe(true);
  });

  it("rejects a file item", () => {
    expect(isFolder({ type: "file" } as DmsItem)).toBe(false);
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
