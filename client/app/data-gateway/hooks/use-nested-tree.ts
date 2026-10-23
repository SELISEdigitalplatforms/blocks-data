import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { IField, IGetSchemaDetailsResponse, ISchemaDetails } from "../models/data-service";
import { nestedRows, isPathExpanded, type NestedTreeRow, type TreeExpansion } from "../utils/nested-tree.util";
import { normalizeSchemaFields } from "../utils/schema-normalization";
import { OPERATION_ACCESS_SCHEMA_ID, findChildSchemaByType } from "../utils/schema-structure.utils";
import { schemaDetailsQueryOptions } from "./use-configuration";

/** One open property of the table itself, whose rows the tree builds. */
export interface TreeRoot {
  path: string;
  field: IField | undefined;
  childSchema: ISchemaDetails;
}

/**
 * The rows under every open property of the table, keyed by that property's name.
 *
 * Children load lazily, one schema-details request per open object, through the same query the
 * embedded child table used (and its cache). The rows are built from the cache first, which says
 * which schemas are still missing; `useQueries` then fetches those and re-renders as each arrives,
 * so a grandchild opened under "Expand all" loads once its parent has.
 */
export function useNestedTree({
  roots,
  lineage,
  expansion,
  schemaItems,
  projectKey,
}: {
  roots: TreeRoot[];
  /** The table's own schema name: the start of every branch's self-reference check. */
  lineage: string;
  expansion: TreeExpansion;
  schemaItems: ISchemaDetails[];
  projectKey: string;
}): Map<string, NestedTreeRow[]> {
  const queryClient = useQueryClient();
  const needed = new Set<string>();

  const fieldsOf = (schema: ISchemaDetails): IField[] | null => {
    // OperationAccess is a fixed platform shape, not a project schema: nothing to fetch.
    if (schema.id === OPERATION_ACCESS_SCHEMA_ID) return schema.fields;
    needed.add(schema.id);
    const cached = queryClient.getQueryData<IGetSchemaDetailsResponse>(schemaDetailsQueryOptions(schema.id, projectKey).queryKey);
    return cached?.data ? normalizeSchemaFields(cached.data.fields) : null;
  };

  const context = {
    isExpanded: (path: string) => isPathExpanded(expansion, path),
    findChild: (type: string | undefined) => findChildSchemaByType(schemaItems, type),
    fieldsOf,
  };

  const rows = new Map<string, NestedTreeRow[]>();
  for (const root of roots) rows.set(root.path, nestedRows(root, [lineage], context));

  // Subscribes to every schema the open branches need; arriving data re-renders the table.
  useQueries({ queries: [...needed].map((id) => schemaDetailsQueryOptions(id, projectKey)) });

  return rows;
}
