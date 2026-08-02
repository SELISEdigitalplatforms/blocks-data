import { getRuntimeEnv } from "@/lib/runtime-env";
import { HttpClient } from "@seliseblocks/genesis-os";

class HttpError extends Error {
  status: number;
  errors: Record<string, string | string[]>;

  constructor(
    status: number,
    error: { errors: Record<string, string | string[]> },
  ) {
    super(error.toString());
    this.status = status;
    this.errors = error.errors;
  }
}

export const serviceInstances = {
  dataService: new HttpClient({
    baseURL: getRuntimeEnv("BLOCKS_DATA_BASE_URL") || "",
    blocksKey: getRuntimeEnv("BLOCKS_X_BLOCKS_KEY") || "",
  }),
  logicService: new HttpClient({
    baseURL: getRuntimeEnv("BLOCKS_LOGIC_BASE_URL") || "",
    blocksKey: getRuntimeEnv("BLOCKS_X_BLOCKS_KEY") || "",
  }),
  idpService: new HttpClient({
    baseURL: getRuntimeEnv("BLOCKS_IAM_BASE_URL") || "",
    blocksKey: getRuntimeEnv("BLOCKS_X_BLOCKS_KEY") || "",
  }),
};

export const http = serviceInstances.dataService;

export { HttpClient, HttpError };
