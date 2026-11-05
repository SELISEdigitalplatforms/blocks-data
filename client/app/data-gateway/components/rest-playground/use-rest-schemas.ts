import { useMemo } from "react";
import { useSchemaList } from "../../hooks/use-configuration";

/** Entity schemas for names and shapes, with DTO schemas so DTO-typed fields get their children. */
export function useRestSchemas(projectKey: string) {
  const {
    data: entityList,
    isPending: isEntitiesPending,
    isError,
    refetch,
  } = useSchemaList({
    projectKey,
    pageNo: 1,
    pageSize: 200,
    schemaType: 1,
  });
  const { data: dtoList, isPending: isDtosPending } = useSchemaList({
    projectKey,
    pageNo: 1,
    pageSize: 200,
    schemaType: 2,
  });
  return useMemo(() => {
    const entities = entityList?.data?.items ?? [];
    return {
      entities,
      allSchemas: [...entities, ...(dtoList?.data?.items ?? [])],
      entityNames: entities.map((s) => s.schemaName).filter(Boolean),
      /** True until both lists have answered, so a shape is never built before its DTOs are known. */
      isPending: isEntitiesPending === true || isDtosPending === true,
      /** The entity list failed; a DTO list failure only leaves DTO-typed fields without children. */
      isError: isError === true,
      /** Retries the entity list. */
      refetch,
    };
  }, [entityList, dtoList, isEntitiesPending, isDtosPending, isError, refetch]);
}
