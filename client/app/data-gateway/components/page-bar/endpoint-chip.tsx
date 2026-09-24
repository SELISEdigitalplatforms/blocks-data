"use client";

import { getRuntimeEnv } from "@/lib/runtime-env";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { GATEWAY_ENDPOINTS } from "../../constants/endpoint.constant";
import { useGetDataServiceConfiguration } from "../../hooks/use-configuration";
import { IDataSourceResponse } from "../../models/data-service";

/**
 * The address every query in this project is sent to.
 *
 * `GATEWAY_ENDPOINTS.EXECUTE` is host-relative (`/api/gateway`) because the app
 * proxies it, so prefix the configured host to get something worth copying into
 * a client or a curl call.
 */
export const gatewayEndpointUrl = () => {
  const host = (getRuntimeEnv("BLOCKS_DATA_BASE_URL") || "").replace(/\/$/, "");
  return `${host}${GATEWAY_ENDPOINTS.EXECUTE}`;
};

/**
 * Endpoint and connected database, in the page bar.
 *
 * This was nowhere in the old UI — people had to open the playground or the
 * configuration page to find out which database they were editing.
 */
export const EndpointChip = () => {
  const { data: configurationData } = useGetDataServiceConfiguration();
  const configuration = configurationData?.data as IDataSourceResponse | undefined;
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const endpoint = gatewayEndpointUrl();

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard?.writeText(endpoint);
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied or missing (insecure origin, older
      // browsers). The endpoint is still on screen, so failing quietly is
      // better than a toast for something the user can select by hand.
    }
  };

  return (
    <div className="hidden h-[26px] items-center gap-2 rounded-full border border-border/50 bg-muted/30 pl-2.5 pr-1 md:flex">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          configuration?.isActive ? "bg-success" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className="max-w-[260px] truncate font-mono text-[11px] text-muted-foreground">
        {GATEWAY_ENDPOINTS.EXECUTE}
        {configuration?.databaseName ? ` · ${configuration.databaseName}` : ""}
      </span>
      <button
        type="button"
        onClick={copyEndpoint}
        aria-label={copied ? "Endpoint copied" : "Copy endpoint"}
        title={endpoint}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
};
