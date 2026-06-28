import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { useEffect, useRef } from "react";
import type * as React from "react";

let browserQueryClient: QueryClient | undefined = undefined;

const makeQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  });
};

export const getQueryClient = () => {
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
};

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const selectedProject = useProjectStore().selectedProject;
  const previousContextRef = useRef<string | null>(null);

  const currentContext = [
    selectedProject?.itemId ?? "",
    selectedProject?.tenantId ?? "",
    selectedProject?.environment ?? "",
  ].join("|");

  useEffect(() => {
    if (previousContextRef.current === null) {
      previousContextRef.current = currentContext;
      return;
    }

    if (previousContextRef.current !== currentContext) {
      queryClient.clear();
      previousContextRef.current = currentContext;
    }
  }, [currentContext, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools buttonPosition="bottom-left" />
    </QueryClientProvider>
  );
}
