import { API_BASES } from "@/constants/endpoint.constant";

const LOG_SUBPATH = "/Log";

export const LOG_ENDPOINTS = {
  GET_LOGS: `${API_BASES.LMT}${LOG_SUBPATH}/GetLogs`,
  GET_LOGS_BY_DATE: `${API_BASES.LMT}${LOG_SUBPATH}/GetLogsByDate`,
  LIVE: `${API_BASES.LMT}${LOG_SUBPATH}/Live`,
} as const;
