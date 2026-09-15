import { getRuntimeEnv } from "@/lib/runtime-env";
import { SERVICE_NAME } from "@/constants/service.constant";
import { HttpClient, HttpError } from "@seliseblocks/genesis-os";
import { createHttpFailureReporter, getRollbar } from "@seliseblocks/genesis-os/observability";

const reportHttpFailure = createHttpFailureReporter(getRollbar({ service: SERVICE_NAME }));

export const serviceInstances = {
  dataService: new HttpClient({
    baseURL: getRuntimeEnv("BLOCKS_DATA_BASE_URL") || "",
    blocksKey: getRuntimeEnv("BLOCKS_X_BLOCKS_KEY") || "",
    onError: reportHttpFailure,
  }),
  logicService: new HttpClient({
    baseURL: getRuntimeEnv("BLOCKS_LOGIC_BASE_URL") || "",
    blocksKey: getRuntimeEnv("BLOCKS_X_BLOCKS_KEY") || "",
    onError: reportHttpFailure,
  }),
  idpService: new HttpClient({
    baseURL: getRuntimeEnv("BLOCKS_IAM_BASE_URL") || "",
    blocksKey: getRuntimeEnv("BLOCKS_X_BLOCKS_KEY") || "",
    onError: reportHttpFailure,
  }),
};

export const http = serviceInstances.dataService;

export { HttpClient, HttpError };
