"use client";

import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { GraphQLPlaygroundPage } from "./graphql-playground-page";

export const GraphQLPlayground = () => {
  return (
    <main className="flex h-full w-full flex-col">
      <div className="flex w-full flex-col gap-2">
        <div className="hidden md:flex">
          <PageBreadcrumb breadcrumbIndex={2} />
        </div>
      </div>
      <div className="w-full flex-1 overflow-hidden">
        <GraphQLPlaygroundPage />
      </div>
    </main>
  );
};
