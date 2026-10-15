import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { STORAGE_CONFIG_ENDPOINTS } from "../constants/endpoint.constant";
import { StorageConfiguration } from "./storage-configuration.service";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("StorageConfiguration service", () => {
  const service = new StorageConfiguration();

  beforeEach(() => vi.clearAllMocks());

  it("gets normalizes the raw list from the API", async () => {
    vi.mocked(http.get).mockResolvedValue([
      { name: "a", storageStrategy: "Amazon" },
    ]);
    const result = await service.gets("proj-1");
    expect(http.get).toHaveBeenCalledWith(
      `${STORAGE_CONFIG_ENDPOINTS.GET_CONFIGS}?ProjectKey=proj-1`,
      undefined,
      { absoluteUrl: true },
    );
    expect(Array.isArray(result)).toBe(true);
  });
});
