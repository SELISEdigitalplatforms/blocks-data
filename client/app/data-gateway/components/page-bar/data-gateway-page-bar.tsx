"use client";

import { DataGatewaySections } from "./data-gateway-sections";
import { DataGatewayUtilities } from "./data-gateway-utilities";
import { EndpointChip } from "./endpoint-chip";
import { PublishControl } from "./publish-control";

/**
 * One bar for every Data Gateway section.
 *
 * Each page used to build its own header out of a breadcrumb and a copy of
 * `DataGatewayActions`, which meant the same destinations were presented five
 * slightly different ways and Publish only existed on one of them. This is that
 * header, once: identity, sections and state all on the one row.
 */
export const DataGatewayPageBar = () => (
  <div className="flex h-[52px] shrink-0 items-stretch gap-3 border-b border-border/50">
    <div className="flex shrink-0 items-center gap-3">
      <h1 className="text-base font-semibold tracking-tight text-foreground">
        Data Gateway
      </h1>
      <EndpointChip />
    </div>

    <DataGatewaySections />

    <div className="flex-1" />

    <div className="flex shrink-0 items-center gap-2">
      <DataGatewayUtilities />
      <PublishControl />
    </div>
  </div>
);
