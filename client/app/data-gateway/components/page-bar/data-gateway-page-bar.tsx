"use client";

import { SHELL } from "../../utils/motion";
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
  <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 border-b border-border/50 lg:h-[52px] lg:flex-nowrap lg:items-stretch">
    {/* Fixed, on large screens, to the Schemas tab's own explorer width minus
        this row's own gap — added back by that gap, it comes out to the same
        264px sidebar + 16px column gap the Schemas tab uses below, so the
        tab list starts exactly where that tab's content column does, instead
        of crowding right up against the endpoint chip. */}
    <div
      style={{ "--dg-title-w": `${SHELL.explorerWidth - 12}px` } as React.CSSProperties}
      className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3 lg:w-[var(--dg-title-w)] lg:flex-none lg:shrink-0"
    >
      <h1 className="text-base font-semibold tracking-tight text-foreground">Data Gateway</h1>
      <span className="hidden min-w-0 lg:block">
        <EndpointChip />
      </span>
    </div>

    <DataGatewaySections />

    <div className="hidden flex-1 lg:block" />

    <div className="order-2 flex shrink-0 items-center gap-2 lg:order-none">
      <DataGatewayUtilities />
      <PublishControl />
    </div>
  </div>
);
