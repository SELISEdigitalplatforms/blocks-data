import { describe, expect, it } from "vitest";
import { filterStorageConfigurations } from "./filter-storage-configurations";

const configs = [
  { name: "Amazon S3", storageStrategy: "Amazon" },
  { name: "Azure Blob", storageStrategy: "Azure" },
  { name: "My SFTP", storageStrategy: "SftpStorage" },
] as never[];

describe("filterStorageConfigurations", () => {
  it("returns all configs when filters are empty", () => {
    const result = filterStorageConfigurations(configs, {
      search: "",
      providers: [],
      types: [],
    });
    expect(result).toHaveLength(3);
  });

  it("matches the search term against name and strategy (case-insensitive)", () => {
    expect(
      filterStorageConfigurations(configs, {
        search: "azure",
        providers: [],
        types: [],
      }),
    ).toEqual([{ name: "Azure Blob", storageStrategy: "Azure" }]);

    // strategy match
    expect(
      filterStorageConfigurations(configs, {
        search: "sftp",
        providers: [],
        types: [],
      }),
    ).toHaveLength(1);
  });

  it("filters by provider list", () => {
    const result = filterStorageConfigurations(configs, {
      search: "",
      providers: ["Amazon", "Azure"],
      types: [],
    });
    expect(result.map((c) => c.storageStrategy)).toEqual(["Amazon", "Azure"]);
  });

  it("combines search and provider filters", () => {
    const result = filterStorageConfigurations(configs, {
      search: "blob",
      providers: ["Amazon"],
      types: [],
    });
    expect(result).toHaveLength(0);
  });
});
