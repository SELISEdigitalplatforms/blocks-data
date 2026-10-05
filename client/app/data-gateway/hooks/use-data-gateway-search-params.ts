import { parseAsInteger, parseAsString, useQueryStates } from "nuqs"

/**
 * Search params for the schemas route.
 *
 * `type` is the Entity/Child list filter and nothing more. It previously
 * doubled as a view switch (absent → security landing), which is why it
 * defaults to "all" rather than null now — security is its own route.
 */
export const useDataGatewaySearchParams = () =>
  useQueryStates(
    {
      type: parseAsString.withDefault("all"),
      schemaId: parseAsString,
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(15),
    },
    /** Match staging URLs that always include `page` and `pageSize` (e.g. `?type=all&schemaId=…&page=1&pageSize=15`). 15 matches the board's own sidebar footer ("1–15 of 42"); 10 left the sidebar's flex-1 list area visibly short of the footer on any viewport tall enough for more rows. */
    { clearOnDefault: false },
  )
