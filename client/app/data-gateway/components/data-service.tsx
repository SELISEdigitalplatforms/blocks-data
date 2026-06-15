"use client";
import { useGetDataServiceConfiguration } from "../hooks/use-configuration";
import { DataServiceInstructions } from "./data-service-instructions";
import { SchemaDetailsPage } from "./schema-details-page";

export const DataService = () => {
  const { data, isLoading } = useGetDataServiceConfiguration();

  if (isLoading || !data) return null;

  return data?.data == null ? (
    <DataServiceInstructions />
  ) : (
    <SchemaDetailsPage />
  );
};
