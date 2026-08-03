import { IImportFile } from "@/data-gateway/models/schema-import-export-notification";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildClientSchema,
  getIntrospectionQuery,
  type IntrospectionQuery,
} from "graphql";
import {
  ICreateSchemaFieldValidationPayload,
  ICreateSchemaPayload,
  IDeleteMockDataPayload,
  IDeletePolicyPayload,
  IDeleteSchemaFieldValidationPayload,
  IExecuteGraphQLPayload,
  IGetSchemaFieldValidationPayload,
  IGetSchemaListPayload,
  ISchemaExportPayload,
  IUpdateSchemaFieldValidationPayload,
  IUpdateSchemaStructure,
} from "../models/data-service";
import {
  configurationService,
} from "../services/configuration.service";

const getProjectKey = () => useProjectStore.getState().selectedProject?.tenantId || "";

export const useCreateDataSourceConfiguration = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.createDataSource,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["data-service-config", "get", projectKey],
      });
    },
  });
};

export const useUpdateDataSourceConfiguration = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.updateDataSource,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["data-service-config", "get", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
    },
  });
};

export const useGetDataServiceConfiguration = () => {
  const projectKey = getProjectKey();

  return useQuery({
    queryKey: ["data-service-config", "get", projectKey],
    queryFn: () => configurationService.getDataServiceDetails(),
  });
};

export const useSchemasReload = () => {
  const queryClient = useQueryClient();
  const selectedProject = useProjectStore().selectedProject;
  const projectShortKey = selectedProject?.tenantSlug || "";
  const projectKey = selectedProject?.tenantId || "";

  return useMutation({
    mutationFn: () => configurationService.reloadSchemas(),
    onSettled: async (_data, error) => {
      const rawIntrospection = await configurationService.executeGraphQLOperation(
        getIntrospectionQuery(),
      );

      if (projectShortKey) {
        queryClient.setQueryData(
          ["graphql-raw-introspection", projectShortKey],
          rawIntrospection,
        );

        const introspectionData = (rawIntrospection as {
          data: IntrospectionQuery;
        }).data;
        queryClient.setQueryData(
          ["graphql-introspection", projectShortKey],
          buildClientSchema(introspectionData),
        );
      }

      await queryClient.invalidateQueries({
        queryKey: ["graphql-raw-introspection"],
        refetchType: "none",
      });
      await queryClient.invalidateQueries({
        queryKey: ["graphql-introspection"],
        refetchType: "none",
      });

      if (!error) {
        await queryClient.invalidateQueries({
          queryKey: ["unadapted-change-logs", projectKey],
        });
        await invalidateSchemaList(queryClient, projectKey);
      }
    },
  });
};

export const useSchemaList = ({
  keyword = "",
  pageNo = 1,
  pageSize = 10,
  sortDescending = true,
  sortBy = "CreatedDate",
  projectKey = "",
  schemaType = "",
}: IGetSchemaListPayload) => {
  return useQuery({
    queryKey: [
      "schema-list",
      keyword,
      pageNo,
      pageSize,
      sortDescending,
      sortBy,
      projectKey,
      schemaType,
    ],
    queryFn: () =>
      configurationService.getSchemaList({
        keyword,
        pageNo,
        pageSize,
        sortDescending,
        sortBy,
        projectKey,
        schemaType,
      }),
  });
};

export const useSecurityAndPerformanceSchemaList = ({
  keyword = "",
  pageNo = 1,
  pageSize = 10,
  sortDescending = true,
  sortBy = "CreatedDate",
  projectKey = "",
  schemaType = "",
}: IGetSchemaListPayload) => {
  return useQuery({
    queryKey: [
      "security-performance-schema-list",
      keyword,
      pageNo,
      pageSize,
      sortDescending,
      sortBy,
      projectKey,
      schemaType,
    ],
    queryFn: () =>
      configurationService.getSecurityAndPerformanceSchemaList({
        keyword,
        pageNo,
        pageSize,
        sortDescending,
        sortBy,
        projectKey,
        schemaType,
      }),
  });
};

export const useSchemaDetails = (
  id: string,
  projectKey: string,
  options?: { enabled?: boolean },
) => {
  const isEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: ["schema-details", id, projectKey],
    queryFn: () => configurationService.getSchemaDetails(id, projectKey),
    enabled: !!id && !!projectKey && isEnabled,
  });
};

const invalidateSchemaList = (
  queryClient: ReturnType<typeof useQueryClient>,
  projectKey: string,
) =>
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key[0] !== "schema-list") return false;
      // query key shape: ["schema-list", keyword, pageNo, pageSize, sortDescending, sortBy, projectKey, schemaType]
      const keyProject = key[6];
      return !projectKey || keyProject === projectKey;
    },
  });

export const useCreateSchema = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.createSchema,
    onSuccess: () => {
      invalidateSchemaList(queryClient, projectKey);
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list", projectKey],
      });
    },
  });
};

export const useUpdateSchema = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.updateSchema,
    onSuccess: (_data, variables: ICreateSchemaPayload) => {
      invalidateSchemaList(queryClient, projectKey);
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.itemId, projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
    },
  });
};

export const useUpdateSchemaStructure = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.updateSchemaStructure,
    onSuccess: (_data, variables: IUpdateSchemaStructure) => {
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.schemaDefinitionItemId, projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
    },
  });
};

export const useDeleteSchema = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: (payload: { id: string; projectKey: string }) =>
      configurationService.deleteSchema(payload),
    onSuccess: (_data, variables) => {
      queryClient.removeQueries({
        queryKey: ["schema-details", variables.id, projectKey],
      });
      invalidateSchemaList(queryClient, projectKey);
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list", projectKey],
      });
    },
  });
};

export const useSetDataAccess = (schemaId?: string) => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.setDataAccess,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["schema-list", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["get-policy-data", projectKey],
      });
      if (schemaId) {
        queryClient.invalidateQueries({
          queryKey: ["schema-details", schemaId, projectKey],
        });
      }
    },
  });
};

export const useSetRowColumnPermission = (schemaId?: string) => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.setRowColumnPermissions,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["schema-list", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["get-policy-data", projectKey],
      });
      if (schemaId) {
        queryClient.invalidateQueries({
          queryKey: ["schema-details", schemaId, projectKey],
        });
      }
    },
  });
};

export const useExecuteGraphQL = () => {
  return useMutation({
    mutationFn: (payload: IExecuteGraphQLPayload) =>
      configurationService.executeGraphQLOperation(payload.query),
  });
};

export const useGetMockData = () => {
  const projectKey = getProjectKey();

  return useQuery({
    queryKey: ["mock-data", projectKey],
    queryFn: () => configurationService.getMockData(),
  });
};

export const useDeleteMockData = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: (payload: IDeleteMockDataPayload) =>
      configurationService.deleteMockData(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["mock-data", projectKey],
      });
    },
  });
};

/** Reuse across field/schema access drawers; avoids refetch on every mount (default staleTime is 0). */
const POLICY_DATA_STALE_TIME_MS = 2 * 60 * 1000;

export function getPolicyDataQueryOptions(
  entityName: string,
  projectKey: string,
) {
  return {
    queryKey: ["get-policy-data", entityName, projectKey] as const,
    queryFn: () => configurationService.getPolicy(entityName, projectKey),
    staleTime: POLICY_DATA_STALE_TIME_MS,
  };
}

export const useGetPolicyData = (option: {
  entityName: string;
  projectKey: string;
  enabled?: boolean;
}) => {
  return useQuery({
    ...getPolicyDataQueryOptions(option.entityName, option.projectKey),
    enabled:
      !!option.entityName && !!option.projectKey && (option.enabled ?? true),
  });
};

export const useCreatePolicy = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.createPolicy,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["get-policy-data", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.schemaId, projectKey],
      });
    },
  });
};

export const useUpdatePolicy = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: configurationService.updatePolicy,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["get-policy-data", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.schemaId, projectKey],
      });
    },
  });
};

export const useDeletePolicy = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: (payload: IDeletePolicyPayload) =>
      configurationService.deletePolicy(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get-policy-data", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["schema-details", projectKey],
      });
    },
  });
};

export const useGetUnadaptedChangeLogs = (option: { projectKey: string }) => {
  return useQuery({
    queryKey: ["unadapted-change-logs", option.projectKey],
    queryFn: () =>
      configurationService.getUnadaptedChangeLogs({
        projectKey: option.projectKey,
      }),
  });
};

export const useGetSchemaFieldValidation = (
  option: IGetSchemaFieldValidationPayload,
) => {
  return useQuery({
    queryKey: [
      "schema-field-validation",
      option.schemaId,
      option.fieldName,
      option.projectKey,
    ],
    queryFn: () => configurationService.getSchemaFieldValidation(option),
    enabled:
      !!option.schemaId &&
      !!option.fieldName &&
      !!option.projectKey &&
      (option.enabled ?? true),
  });
};

export const useCreateSchemaFieldValidation = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: (payload: ICreateSchemaFieldValidationPayload) =>
      configurationService.createSchemaFieldValidation(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          "schema-field-validation",
          variables.schemaId,
          variables.fieldName,
          variables.projectKey,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.schemaId, projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
    },
  });
};

export const useDeleteSchemaFieldValidation = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: (
      payload: IDeleteSchemaFieldValidationPayload & {
        schemaId?: string;
        fieldName?: string;
      },
    ) => {
      const { id, projectKey } = payload;
      return configurationService.deleteSchemaFieldValidation({
        id,
        projectKey,
      });
    },
    onSuccess: (_data, variables) => {
      if (variables.schemaId && variables.fieldName) {
        queryClient.invalidateQueries({
          queryKey: [
            "schema-field-validation",
            variables.schemaId,
            variables.fieldName,
            variables.projectKey,
          ],
        });
        queryClient.invalidateQueries({
          queryKey: ["schema-details", variables.schemaId, projectKey],
        });
        queryClient.invalidateQueries({
          queryKey: ["unadapted-change-logs", projectKey],
        });
      }
    },
  });
};

export const useUpdateSchemaFieldValidation = () => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationFn: (payload: IUpdateSchemaFieldValidationPayload) =>
      configurationService.updateSchemaFieldValidation(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          "schema-field-validation",
          variables.schemaId,
          variables.fieldName,
          variables.projectKey,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.schemaId, projectKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
    },
  });
};

export const useGenerateRegex = () => {
  return useMutation({
    mutationFn: (payload: { description: string }) =>
      configurationService.generateRegex(payload),
  });
};

export const useSchemaExport = () => {
  return useMutation({
    mutationFn: (payload: ISchemaExportPayload) =>
      configurationService.exportSchema(payload),
  });
};

/**
 * Fetches the GraphQL introspection schema from the gateway and builds
 * a traversable GraphQLSchema object for autocompletion.
 */
export const useGraphQLIntrospection = (options: {
  projectShortKey: string;
  enabled?: boolean;
}) => {
  return useQuery({
    queryKey: ["graphql-introspection", options.projectShortKey],
    queryFn: async () => {
      const result = await configurationService.executeGraphQLOperation(
        getIntrospectionQuery(),
      );
      // The gateway returns { data: { __schema: ... } }
      const introspectionData = (result as { data: IntrospectionQuery }).data;
      return buildClientSchema(introspectionData);
    },
    enabled: (options.enabled ?? true) && !!options.projectShortKey,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
};

/** Raw introspection JSON for the Schemas drawer; cached until configurations reload invalidates it. */
export const useRawIntrospectionQuery = (options: {
  projectKey: string;
  enabled?: boolean;
}) => {
  return useQuery({
    queryKey: ["graphql-raw-introspection", options.projectKey],
    queryFn: () =>
      configurationService.executeGraphQLOperation(
        getIntrospectionQuery(),
      ),
    enabled: !!options.projectKey && (options.enabled ?? true),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
};

export const useImportSchemaFile = (_payload: IImportFile) => {
  const queryClient = useQueryClient();
  const projectKey = getProjectKey();

  return useMutation({
    mutationKey: ["import-schema-file"],
    mutationFn: configurationService.importSchemaFile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["graphql-raw-introspection"],
        refetchType: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: ["graphql-introspection"],
        refetchType: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: ["schema-list", projectKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["unadapted-change-logs", projectKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list", projectKey],
      });
    },
  });
};
