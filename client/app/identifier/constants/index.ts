import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_CONSOLE_MODULE = "data.console";
const COMMON_ERROR = "common:ERROR";
const LOG_ERROR_COLOR = "bg-red-500";
export enum REGISTER_SERVICE_TYPE {
  None = 0,
  Api = 1,
  Worker = 2,
}

export const REGISTER_SERVICE_TYPES: { value: REGISTER_SERVICE_TYPE; label: string }[] = [
  { value: REGISTER_SERVICE_TYPE.None, get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.NONE"); } },
  { value: REGISTER_SERVICE_TYPE.Api, label: "API" },
  { value: REGISTER_SERVICE_TYPE.Worker, get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.WORKER"); } },
];

export const REGISTER_SERVICE_ENVIRONMENTS = [
  { value: "prod", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.PRODUCTION"); } },
  { value: "stg", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.STAGING"); } },
  { value: "dev", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.DEVELOPMENT"); } },
];

export const LOG_LEVELS = [
  { value: "debug", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.DEBUG"); }, color: "bg-gray-500" },
  { value: "info", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.INFO"); }, color: "bg-blue-500" },
  { value: "warn", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.WARNING"); }, color: "bg-yellow-500" },
  { value: "error", get label() { return tStatic(DATA_CONSOLE_MODULE, COMMON_ERROR); }, color: LOG_ERROR_COLOR },
  { value: "fatal", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.FATAL"); }, color: "bg-red-700" },
] as const;

export const SERVICE_STATUS = [
  { value: "active", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.ACTIVE"); }, color: "bg-green-500" },
  { value: "inactive", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.INACTIVE"); }, color: "bg-gray-500" },
  { value: "error", get label() { return tStatic(DATA_CONSOLE_MODULE, COMMON_ERROR); }, color: LOG_ERROR_COLOR },
] as const;

export const TRACE_STATUS = [
  { value: "ok", get label() { return tStatic(DATA_CONSOLE_MODULE, "common:SUCCESS"); }, color: "bg-green-500" },
  { value: "error", get label() { return tStatic(DATA_CONSOLE_MODULE, COMMON_ERROR); }, color: LOG_ERROR_COLOR },
  { value: "timeout", get label() { return tStatic(DATA_CONSOLE_MODULE, "CONSTANTS.TIMEOUT"); }, color: "bg-yellow-500" },
] as const;
