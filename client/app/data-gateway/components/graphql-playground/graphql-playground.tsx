"use client";

import { DataGatewayPageBar } from "../page-bar";
import { GraphQLPlaygroundPage } from "./graphql-playground-page";

export const GraphQLPlayground = () => {
  return (
    <main className="flex h-full min-h-0 w-full flex-col gap-4 p-6">
      <DataGatewayPageBar />
      <div className="w-full flex-1 overflow-hidden">
        <GraphQLPlaygroundPage />
      </div>
    </main>
  );
};
