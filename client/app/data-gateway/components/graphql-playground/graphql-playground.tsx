"use client";

import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { DataGatewayActions } from "../data-gateway-actions";
import { GraphQLPlaygroundPage } from "./graphql-playground-page";

export const GraphQLPlayground = () => {
  return (
    <main className="flex h-full min-h-0 w-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="hidden md:flex">
          <PageBreadcrumb breadcrumbIndex={2} />
        </div>
        <DataGatewayActions />
      </div>
      <div className="w-full flex-1 overflow-hidden">
        <GraphQLPlaygroundPage />
      </div>
    </main>
  );
};
