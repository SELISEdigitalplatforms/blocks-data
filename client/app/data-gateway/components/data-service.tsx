"use client";
import { useGetDataServiceConfiguration } from "../hooks/use-configuration";
import { useProjectStore } from "@/store/useProjectStore";
import { SchemaDetailsPage } from "./schema-details-page";
import { DataServiceInstructions } from "./data-service-instructions";

export const DataService = () => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const { data, isLoading } = useGetDataServiceConfiguration();

  if (isLoading || !data) return null;

  return data?.data == null ? (
    <DataServiceInstructions />
  ) : (
    <SchemaDetailsPage />
  );
};
