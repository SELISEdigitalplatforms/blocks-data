import type { IStorageConfiguration } from "../models/storage.model"

const NESTED_ARRAY_KEYS = [
  "items",
  "Items",
  "configurations",
  "Configurations",
  "data",
  "Data",
  "result",
  "Result",
  "value",
  "Value",
] as const

/**
 * Cloud Configuration `Storage/Gets` may return a bare array or a wrapper object.
 * React views assume an array; normalize here so callers never hit `.findIndex` on a non-array.
 */
export const normalizeStorageConfigurationsList = (
  payload: unknown,
): IStorageConfiguration[] => {
  if (Array.isArray(payload)) {
    return payload
  }
  if (payload === null || typeof payload !== "object") {
    return []
  }
  const record = payload as Record<string, unknown>
  for (const key of NESTED_ARRAY_KEYS) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value as IStorageConfiguration[]
    }
  }
  return []
}
