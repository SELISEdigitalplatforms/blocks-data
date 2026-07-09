import type {
  IStorageConfiguration,
  StorageStrategyType,
} from "../models/storage.model";

export type StorageFilterValues = {
  search: string;
  providers: string[];
  types: string[];
};

const normalizeValue = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

export const filterStorageConfigurations = (
  configurations: IStorageConfiguration[],
  filters: StorageFilterValues,
): IStorageConfiguration[] => {
  const normalizedSearch = normalizeValue(filters.search);

  return configurations.filter((configuration) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      [configuration.name, configuration.storageStrategy].some((value) =>
        normalizeValue(value).includes(normalizedSearch),
      );

    const matchesProvider =
      filters.providers.length === 0 ||
      filters.providers.includes(
        configuration.storageStrategy as StorageStrategyType,
      );

    return matchesSearch && matchesProvider;
  });
};
