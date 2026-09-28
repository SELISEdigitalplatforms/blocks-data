"use client";

import { DataGatewayPageBar } from "../page-bar";
import { GraphQLPlaygroundPage } from "./graphql-playground-page";

export const GraphQLPlayground = () => {
  return (
    <main className="flex min-h-[80dvh] w-full flex-col gap-4 p-3 sm:p-6 md:h-full md:min-h-0">
      <DataGatewayPageBar />
      <div className="w-full flex-1 overflow-hidden">
        <GraphQLPlaygroundPage />
      </div>
    </main>
  );
};
