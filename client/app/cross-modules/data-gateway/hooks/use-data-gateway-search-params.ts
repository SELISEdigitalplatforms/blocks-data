import { parseAsInteger, parseAsString, useQueryStates } from "nuqs"

/** Absent `type` → security landing; with `type` → schemas list + detail. */
export const useDataGatewaySearchParams = () =>
  useQueryStates({
    type: parseAsString,
    schemaId: parseAsString,
    page: parseAsInteger.withDefault(1),
    pageSize: parseAsInteger.withDefault(10),
  })
