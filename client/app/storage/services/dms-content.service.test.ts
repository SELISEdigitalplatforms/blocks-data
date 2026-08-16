import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__/mock-http-client";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

import { http } from "@/lib/http-client";
import { DmsContentService } from "./dms-content.service";

describe("DmsContentService", () => {
  const service = new DmsContentService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the search term and its filters", async () => {
    await service.search({ query: "report", directoryId: "dir-1", type: "file", limit: 10 });

    const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/Object/SearchObject");
    expect(url).toContain("query=report");
    expect(url).toContain("directoryId=dir-1");
    expect(url).toContain("type=file");
    expect(url).toContain("limit=10");
  });

  it("asks for the whole trash when no filter is given", async () => {
    await service.getTrash();

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("/Object/GetTrash"));
  });

  it("restores by resource id", async () => {
    await service.restore("res-1");

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Object/RestoreFromTrash"),
      { resourceId: "res-1" },
    );
  });

  it("permanently deletes through the trash endpoint, not the directory one", async () => {
    // These are different permissions on the server. Sending a permanent delete to
    // the directory endpoint would bypass the trash entirely.
    await service.deletePermanently("res-1");

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Object/DeleteFromTrash"),
      { resourceId: "res-1" },
    );
  });

  it("requests inherited policies by default", async () => {
    await service.getAccessPolicies("res-1");

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("includeInherited=true"));
  });

  it("can ask for a resource's own policies only", async () => {
    await service.getAccessPolicies("res-1", false);

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("includeInherited=false"));
  });

  it("forwards a grant unchanged", async () => {
    const payload = {
      resourceId: "res-1",
      principalType: "Role" as const,
      principalId: "editors",
      permission: "Edit" as const,
      effect: "Allow" as const,
    };

    await service.grantAccess(payload);

    expect(http.post).toHaveBeenCalledWith(expect.stringContaining("/Object/GrantAccess"), payload);
  });

  it("revokes with both the resource and the policy id", async () => {
    await service.revokeAccessPolicy("res-1", "policy-1");

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Object/RevokeAccessPolicy"),
      { resourceId: "res-1", policyItemId: "policy-1" },
    );
  });

  it("sends the inheritance flag under the name the server reads", async () => {
    await service.toggleInheritance("res-1", false);

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Object/ToggleInheritance"),
      { resourceId: "res-1", inheritsParentAccess: false },
    );
  });

  it("copies a file without its access entries unless asked", async () => {
    await service.copyFile("file-1", "dir-2");

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Files/CopyFile"),
      { fileId: "file-1", targetDirectoryId: "dir-2", copyAccessPolicies: false },
    );
  });

  it("copies access entries when asked", async () => {
    await service.copyFile("file-1", "dir-2", true);

    expect(http.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ copyAccessPolicies: true }),
    );
  });

  it("reads file versions with paging", async () => {
    await service.getFileVersions("file-1", "cursor-1", 10);

    const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/Files/GetFileVersions");
    expect(url).toContain("fileId=file-1");
    expect(url).toContain("cursor=cursor-1");
    expect(url).toContain("limit=10");
  });

  it("updates an existing policy through its own endpoint", async () => {
    await service.updateAccessPolicy({
      resourceId: "res-1",
      policyItemId: "policy-1",
      principalType: "User",
      principalId: "user-2",
      permission: "Edit",
      effect: "Allow",
    });

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Object/UpdateAccessPolicy"),
      expect.objectContaining({ policyItemId: "policy-1" }),
    );
  });

  it("resolves the caller's own effective access", async () => {
    await service.resolveAccess("res-1");

    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining("/Object/ResolveAccess?resourceId=res-1"),
    );
  });

  it("shares through the share endpoint rather than a plain grant", async () => {
    // Sharing records an audit entry the plain grant does not, so the two are
    // not interchangeable even though the stored entry looks the same.
    const payload = {
      resourceId: "res-1",
      principalType: "User" as const,
      principalId: "user-2",
      permission: "View" as const,
    };

    await service.shareObject(payload);

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Object/ShareObject"),
      payload,
    );
  });

  it("requests a presigned url for a new version", async () => {
    await service.createFileVersion("file-1", "azure");

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Files/CreateFileVersion"),
      { fileId: "file-1", configurationName: "azure" },
    );
  });

  it("moves a file to another directory", async () => {
    await service.moveFile("file-1", "dir-2");

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("/Files/MoveFile"),
      { fileId: "file-1", targetDirectoryId: "dir-2" },
    );
  });
});
