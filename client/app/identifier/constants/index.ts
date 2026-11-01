import { tStatic } from "@seliseblocks/genesis-os/i18n";
export enum REGISTER_SERVICE_TYPE {
  None = 0,
  Api = 1,
  Worker = 2,
}

export const REGISTER_SERVICE_TYPES: { value: REGISTER_SERVICE_TYPE; label: string }[] = [
  { value: REGISTER_SERVICE_TYPE.None, get label() { return tStatic("data.console", "CONSTANTS.NONE"); } },
  { value: REGISTER_SERVICE_TYPE.Api, label: "API" },
  { value: REGISTER_SERVICE_TYPE.Worker, get label() { return tStatic("data.console", "CONSTANTS.WORKER"); } },
];

export const REGISTER_SERVICE_ENVIRONMENTS = [
  { value: "prod", get label() { return tStatic("data.console", "CONSTANTS.PRODUCTION"); } },
  { value: "stg", get label() { return tStatic("data.console", "CONSTANTS.STAGING"); } },
  { value: "dev", get label() { return tStatic("data.console", "CONSTANTS.DEVELOPMENT"); } },
];

export const LOG_LEVELS = [
  { value: "debug", get label() { return tStatic("data.console", "CONSTANTS.DEBUG"); }, color: "bg-gray-500" },
  { value: "info", get label() { return tStatic("data.console", "CONSTANTS.INFO"); }, color: "bg-blue-500" },
  { value: "warn", get label() { return tStatic("data.console", "CONSTANTS.WARNING"); }, color: "bg-yellow-500" },
  { value: "error", get label() { return tStatic("data.console", "common:ERROR"); }, color: "bg-red-500" },
  { value: "fatal", get label() { return tStatic("data.console", "CONSTANTS.FATAL"); }, color: "bg-red-700" },
] as const;

export const SERVICE_STATUS = [
  { value: "active", get label() { return tStatic("data.console", "CONSTANTS.ACTIVE"); }, color: "bg-green-500" },
  { value: "inactive", get label() { return tStatic("data.console", "CONSTANTS.INACTIVE"); }, color: "bg-gray-500" },
  { value: "error", get label() { return tStatic("data.console", "common:ERROR"); }, color: "bg-red-500" },
] as const;

export const TRACE_STATUS = [
  { value: "ok", get label() { return tStatic("data.console", "common:SUCCESS"); }, color: "bg-green-500" },
  { value: "error", get label() { return tStatic("data.console", "common:ERROR"); }, color: "bg-red-500" },
  { value: "timeout", get label() { return tStatic("data.console", "CONSTANTS.TIMEOUT"); }, color: "bg-yellow-500" },
] as const;
