import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__/mock-http-client";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

import { http } from "@/lib/http-client";
import { DmsFolderService, toQuery } from "./dms-folder.service";

describe("toQuery", () => {
  it("omits values that were never set", () => {
    // An omitted filter must not arrive as the string "undefined", which the server
    // would treat as a real value and match nothing against.
    expect(toQuery({ a: "1", b: undefined, c: "" })).toBe("?a=1");
  });

  it("returns an empty string when nothing is set at all", () => {
    expect(toQuery({ a: undefined })).toBe("");
  });

  it("keeps false and zero, which are real values", () => {
    expect(toQuery({ inherited: false, limit: 0 })).toBe("?inherited=false&limit=0");
  });

  it("encodes values that would otherwise break the query string", () => {
    expect(toQuery({ search: "a&b=c" })).toBe("?search=a%26b%3Dc");
  });
});

describe("DmsFolderService", () => {
  const service = new DmsFolderService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a folder by id", async () => {
    await service.getFolder("dir-1");

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("/Folders/GetFolder?folderId=dir-1"));
  });

  it("passes every listing filter through", async () => {
    await service.getChildren({
      folderId: "dir-1",
      cursor: "c1",
      limit: 25,
      type: "file",
      search: "report",
    });

    const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("folderId=dir-1");
    expect(url).toContain("cursor=c1");
    expect(url).toContain("limit=25");
    expect(url).toContain("type=file");
    expect(url).toContain("search=report");
  });

  it("routes a folder with a parent to CreateFolder", async () => {
    await service.createFolder({ name: "Reports", parentDirectoryId: "root" });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Folders/CreateFolder"),
      expect.objectContaining({ name: "Reports", parentFolderId: "root" }),
    );
  });

  it("routes a folder with no parent to CreateRootFolder", async () => {
    // The two carry different permissions on the server, so picking the endpoint by
    // payload is what keeps that distinction intact from the client side.
    await service.createFolder({ name: "Reports" });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Folders/CreateRootFolder"),
      expect.objectContaining({ name: "Reports" }),
    );
  });

  it("defaults a delete to the trash rather than a permanent removal", async () => {
    await service.deleteFolder({ folderId: "dir-1" });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Folders/DeleteFolder"),
      { folderId: "dir-1", permanent: false },
    );
  });

  it("forwards an explicit permanent delete", async () => {
    await service.deleteFolder({ folderId: "dir-1", permanent: true });

    expect(http.post).toHaveBeenCalledWith(expect.any(String), { folderId: "dir-1", permanent: true });
  });

  it("moves a folder to the root when no target is given", async () => {
    await service.moveFolder({ folderId: "dir-1" });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Folders/MoveFolder"),
      { folderId: "dir-1" },
    );
  });
});
