import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__/mock-http-client";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

import { serviceInstances } from "@/lib/http-client";
import { IamPrincipalService } from "./iam-principal.service";

describe("IamPrincipalService", () => {
  const service = new IamPrincipalService();
  const idp = serviceInstances.idpService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts a filter body to the users endpoint", async () => {
    idp.post.mockResolvedValue({
      data: [
        { itemId: "u1", email: "alice@x.com", firstName: "Alice", lastName: "Lee" },
        { itemId: "u2", email: "bob@x.com" },
      ],
      totalCount: 2,
    });

    const options = await service.getUsers("alice");

    expect(idp.post).toHaveBeenCalledWith(
      expect.stringContaining("/iam/users"),
      expect.objectContaining({ filter: { email: "alice", name: "alice" } }),
    );
    expect(options).toEqual([
      { value: "u1", label: "Alice Lee", description: "alice@x.com" },
      { value: "u2", label: "bob@x.com", description: "bob@x.com" },
    ]);
  });

  it("omits the filter when no search term is given", async () => {
    idp.post.mockResolvedValue({ data: [], totalCount: 0 });

    await service.getUsers();

    const payload = idp.post.mock.calls[0][1] as { filter?: unknown };
    expect(payload.filter).toBeUndefined();
  });

  it("drops users without an itemId", async () => {
    idp.post.mockResolvedValue({ data: [{ email: "ghost@x.com" }, { itemId: "u9" }], totalCount: 2 });

    const options = await service.getUsers();

    expect(options).toHaveLength(1);
    expect(options[0].value).toBe("u9");
  });

  it("returns the role slug as the value", async () => {
    idp.post.mockResolvedValue({
      data: [{ itemId: "r-1", name: "Editors", slug: "editors", description: "Can edit" }],
      totalCount: 1,
    });

    const options = await service.getRoles();

    expect(idp.post).toHaveBeenCalledWith(expect.stringContaining("/iam/roles"), expect.anything());
    expect(options).toEqual([{ value: "editors", label: "Editors", description: "Can edit" }]);
  });

  it("filters out roles that lack a slug", async () => {
    idp.post.mockResolvedValue({ data: [{ name: "NoSlug" }, { slug: "admins" }], totalCount: 2 });

    const options = await service.getRoles();

    expect(options).toHaveLength(1);
    expect(options[0].value).toBe("admins");
  });

  it("GETs organizations and reads the itemId", async () => {
    idp.get.mockResolvedValue({
      organizations: [
        { itemId: "o1", name: "Acme", shortCode: "ACM" },
        { itemId: "o2", name: "Globex", shortCode: "GLB", description: "Subsidiary" },
      ],
      totalCount: 2,
      isSuccess: true,
    });

    const options = await service.getOrganizations("acme");

    const url = idp.get.mock.calls[0][0] as string;
    expect(url).toContain("/iam/organizations");
    expect(url).toContain("Filter.Search=acme");
    expect(options).toEqual([
      { value: "o1", label: "Acme", description: "ACM" },
      { value: "o2", label: "Globex", description: "GLB" },
    ]);
  });

  it("tolerates an empty organizations array", async () => {
    idp.get.mockResolvedValue({ organizations: null, totalCount: 0 });

    const options = await service.getOrganizations();

    expect(options).toEqual([]);
  });
});
