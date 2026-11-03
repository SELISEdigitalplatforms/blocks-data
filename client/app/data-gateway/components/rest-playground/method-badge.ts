import type { RestMethod } from "../../rest/request-templates";

/** Badge colours per HTTP method (spec §3.2): GET blue, POST green, PATCH amber, PUT violet, DELETE red. */
export const METHOD_BADGE: Record<RestMethod, string> = {
  GET: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  POST: "bg-green-500/10 text-green-600 dark:text-green-400",
  PATCH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PUT: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
};
