"use client";

import { useDataGatewayPath } from "@/hooks/use-scoped-path";
import { useNavigate } from "react-router";

import { DataGatewayPageBar } from "../page-bar";
import SecurityAndPerformance from "./security-and-performance";

/**
 * The `/data-gateway/security` route.
 *
 * Previously this view was reached by visiting `/data-gateway` with no search
 * params, which made a bare bookmark land on the security table rather than on
 * the schemas people actually came to edit. It is its own route now, and
 * navigating to a schema hands off to the schemas route with `schemaId` set.
 */
export const SecurityLanding = () => {
  const navigate = useNavigate();
  const dataGatewayPath = useDataGatewayPath();

  const openSchema = (schemaId: string) =>
    navigate(`${dataGatewayPath}?type=all&schemaId=${schemaId}&page=1&pageSize=15`);

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <DataGatewayPageBar />

      {/* The table owns the scrolling; the page does not. */}
      <SecurityAndPerformance
        onSchemaRowClick={(schema) => openSchema(schema.id ?? "")}
        onSchemaCreated={(schemaId) => openSchema(schemaId)}
        onNavigateToSchemas={() => navigate(dataGatewayPath)}
      />
    </div>
  );
};
