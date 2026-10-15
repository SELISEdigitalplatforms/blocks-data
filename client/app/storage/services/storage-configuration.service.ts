import { http } from "@/lib/http-client";
import {
  IStorageConfiguration,
} from "../models/storage.model";
import { STORAGE_CONFIG_ENDPOINTS } from "../constants/endpoint.constant";
import { normalizeStorageConfigurationsList } from "../utils/normalize-storage-configurations-list";

/** Read-only: storage configurations are created, saved and deleted in Blocks OS. */
export class StorageConfiguration {
  async gets(projectKey: string): Promise<IStorageConfiguration[]> {
    const raw = await http.get<unknown>(
      `${STORAGE_CONFIG_ENDPOINTS.GET_CONFIGS}?ProjectKey=${projectKey}`,
      undefined,
      { absoluteUrl: true },
    );
    return normalizeStorageConfigurationsList(raw);
  }
}
