import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__/mock-http-client";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

import { http } from "@/lib/http-client";
import { DmsDirectoryService, toQuery } from "./dms-directory.service";

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

describe("DmsDirectoryService", () => {
  const service = new DmsDirectoryService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a directory by id", async () => {
    await service.getDirectory("dir-1");

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("/Directory/GetDirectory?directoryId=dir-1"));
  });

  it("passes every listing filter through", async () => {
    await service.getChildren({
      directoryId: "dir-1",
      cursor: "c1",
      limit: 25,
      type: "file",
      search: "report",
    });

    const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/Object/GetObject");
    expect(url).toContain("parentDirectoryId=dir-1");
    expect(url).toContain("cursor=c1");
    expect(url).toContain("limit=25");
    expect(url).toContain("type=file");
    expect(url).toContain("search=report");
  });

  it("routes a directory with a parent to CreateDirectory", async () => {
    await service.createDirectory({ name: "Reports", parentDirectoryId: "root" });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Directory/CreateDirectory"),
      expect.objectContaining({ name: "Reports", parentDirectoryId: "root" }),
    );
  });

  it("routes a directory with no parent to CreateRootDirectory", async () => {
    // The two carry different permissions on the server, so picking the endpoint by
    // payload is what keeps that distinction intact from the client side.
    await service.createDirectory({ name: "Reports" });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Directory/CreateRootDirectory"),
      expect.objectContaining({ name: "Reports" }),
    );
  });

  it("defaults a delete to permanent removal", async () => {
    await service.deleteDirectory({ directoryId: "dir-1" });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Directory/DeleteDirectory"),
      { directoryId: "dir-1", permanent: true },
    );
  });

  it("forwards an explicit soft delete", async () => {
    await service.deleteDirectory({ directoryId: "dir-1", permanent: false });

    expect(http.post).toHaveBeenCalledWith(expect.any(String), { directoryId: "dir-1", permanent: false });
  });

  it("moves a directory to the root when no target is given", async () => {
    await service.moveDirectory({ directoryId: "dir-1" });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Directory/MoveDirectory"),
      { directoryId: "dir-1" },
    );
  });
});
