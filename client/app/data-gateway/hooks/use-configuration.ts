import { IImportFile } from "@/data-gateway/models/schema-import-export-notification";
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
  GRAPHQL_PLAYGROUND_INTROSPECTION_HEADERS,
} from "../services/configuration.service";

export const useCreateDataSourceConfiguration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configurationService.createDataSource,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["data-service-config", "get"],
      });
    },
  });
};

export const useUpdateDataSourceConfiguration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configurationService.updateDataSource,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["data-service-config", "get"],
      });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
    },
  });
};

export const useGetDataServiceConfiguration = () => {
  return useQuery({
    queryKey: ["data-service-config", "get"],
    queryFn: () => configurationService.getDataServiceDetails(),
  });
};

export const useSchemasReload = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { projectKey: string; projectShortKey?: string }) =>
      configurationService.reloadSchemas({
        projectKey: payload.projectKey,
        projectShortKey: payload.projectShortKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema-list"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({
        queryKey: ["graphql-raw-introspection"],
      });
      queryClient.invalidateQueries({ queryKey: ["graphql-introspection"] });
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

export const useCreateSchema = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configurationService.createSchema,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema-list"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list"],
      });
    },
  });
};

export const useUpdateSchema = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configurationService.updateSchema,
    onSuccess: (_data, variables: ICreateSchemaPayload) => {
      queryClient.invalidateQueries({ queryKey: ["schema-list"] });
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.itemId],
      });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
    },
  });
};

export const useUpdateSchemaStructure = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configurationService.updateSchemaStructure,
    onSuccess: (_data, variables: IUpdateSchemaStructure) => {
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.schemaDefinitionItemId],
      });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
    },
  });
};

export const useDeleteSchema = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { id: string; projectKey: string }) =>
      configurationService.deleteSchema(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema-list"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list"],
      });
    },
  });
};

export const useSetDataAccess = (schemaId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configurationService.setDataAccess,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema-list"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list"],
      });
      queryClient.invalidateQueries({ queryKey: ["get-policy-data"] });
      if (schemaId) {
        queryClient.invalidateQueries({
          queryKey: ["schema-details", schemaId],
        });
      }
    },
  });
};

export const useSetRowColumnPermission = (schemaId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configurationService.setRowColumnPermissions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema-list"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list"],
      });
      queryClient.invalidateQueries({ queryKey: ["get-policy-data"] });
      if (schemaId) {
        queryClient.invalidateQueries({
          queryKey: ["schema-details", schemaId],
        });
      }
    },
  });
};

export const useExecuteGraphQL = () => {
  return useMutation({
    mutationFn: (payload: IExecuteGraphQLPayload) =>
      configurationService.executeGraphQLOperation(
        payload.projectShortKey,
        payload.query,
      ),
  });
};

export const useGetMockData = () => {
  return useQuery({
    queryKey: ["mock-data"],
    queryFn: () => configurationService.getMockData(),
  });
};

export const useDeleteMockData = () => {
  return useMutation({
    mutationFn: (payload: IDeleteMockDataPayload) =>
      configurationService.deleteMockData(payload),
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

  return useMutation({
    mutationFn: configurationService.createPolicy,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["get-policy-data"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.schemaId],
      });
    },
  });
};

export const useUpdatePolicy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: configurationService.updatePolicy,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["get-policy-data"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({
        queryKey: ["schema-details", variables.schemaId],
      });
    },
  });
};

export const useDeletePolicy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: IDeletePolicyPayload) =>
      configurationService.deletePolicy(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get-policy-data"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({ queryKey: ["schema-details"] });
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

export const useGetPodActiveStatus = (option: {
  slug: string;
  refetchInterval?: number | false;
}) => {
  return useQuery({
    queryKey: ["ping-pod", option.slug],
    queryFn: () => configurationService.getPodActiveStatus(option.slug),
    refetchInterval: option.refetchInterval,
    retry: false,
    refetchOnWindowFocus: false,
  });
};

export const useInitiateDataGatewayPipeline = (option: {
  projectKey: string;
  enabled?: boolean;
}) => {
  return useQuery({
    queryKey: ["initiate-pod", option.projectKey],
    queryFn: () =>
      configurationService.initiateDataGatewayPipeline({
        projectKey: option.projectKey,
      }),
    enabled: option.enabled ?? true,
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
        queryKey: ["schema-details", variables.schemaId],
      });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
    },
  });
};

export const useDeleteSchemaFieldValidation = () => {
  const queryClient = useQueryClient();

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
          queryKey: ["schema-details", variables.schemaId],
        });
        queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      }
    },
  });
};

export const useUpdateSchemaFieldValidation = () => {
  const queryClient = useQueryClient();

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
        queryKey: ["schema-details", variables.schemaId],
      });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
    },
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
        options.projectShortKey,
        getIntrospectionQuery(),
        GRAPHQL_PLAYGROUND_INTROSPECTION_HEADERS,
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
  projectShortKey: string;
  enabled?: boolean;
}) => {
  return useQuery({
    queryKey: ["graphql-raw-introspection", options.projectShortKey],
    queryFn: () =>
      configurationService.executeGraphQLOperation(
        options.projectShortKey,
        getIntrospectionQuery(),
        GRAPHQL_PLAYGROUND_INTROSPECTION_HEADERS,
      ),
    enabled: !!options.projectShortKey && (options.enabled ?? true),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
};

export const useImportSchemaFile = (_payload: IImportFile) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["import-schema-file"],
    mutationFn: configurationService.importSchemaFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema-list"] });
      queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] });
      queryClient.invalidateQueries({
        queryKey: ["security-performance-schema-list"],
      });
      queryClient.invalidateQueries({
        queryKey: ["graphql-raw-introspection"],
      });
      queryClient.invalidateQueries({ queryKey: ["graphql-introspection"] });
    },
  });
};
