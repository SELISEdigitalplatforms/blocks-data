import { describe, expect, it } from "vitest";
import { normalizeStorageConfigurationsList } from "./normalize-storage-configurations-list";
import type { IStorageConfiguration } from "../models/storage.model";

const sample = { itemId: "1", name: "Default", storageStrategy: "Amazon" } as IStorageConfiguration;

describe("normalizeStorageConfigurationsList", () => {
  it("returns the same array when payload is already an array", () => {
    const list = [sample];
    expect(normalizeStorageConfigurationsList(list)).toBe(list);
  });

  it("unwraps common wrapper keys", () => {
    expect(normalizeStorageConfigurationsList({ items: [sample] })).toEqual([sample]);
    expect(normalizeStorageConfigurationsList({ Items: [sample] })).toEqual([sample]);
    expect(normalizeStorageConfigurationsList({ configurations: [sample] })).toEqual([sample]);
    expect(normalizeStorageConfigurationsList({ data: [sample] })).toEqual([sample]);
  });

  it("returns empty array for null, primitives, or unrecognized shapes", () => {
    expect(normalizeStorageConfigurationsList(null)).toEqual([]);
    expect(normalizeStorageConfigurationsList(undefined)).toEqual([]);
    expect(normalizeStorageConfigurationsList("x")).toEqual([]);
    expect(normalizeStorageConfigurationsList({})).toEqual([]);
    expect(normalizeStorageConfigurationsList({ items: "bad" })).toEqual([]);
  });
});
