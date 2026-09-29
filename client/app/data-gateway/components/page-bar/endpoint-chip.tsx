"use client";

import { getRuntimeEnv } from "@/lib/runtime-env";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useGetDataServiceConfiguration } from "../../hooks/use-configuration";
import { IDataSourceResponse } from "../../models/data-service";

/** The short, host-relative label shown in the chip — not what actually gets
 *  copied. `/api/gateway` is this app's own proxy path and isn't reachable
 *  from outside it, so a curl call or another client needs the real address
 *  (`BLOCKS_GRAPHQL_PUBLIC_URL`) instead. */
const GATEWAY_LABEL = "/gateway";

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

  const endpoint = getRuntimeEnv("BLOCKS_GRAPHQL_PUBLIC_URL");

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
    <div
      className="hidden h-[26px] items-center gap-2 rounded-full border border-border/40 bg-muted/30 pl-2.5 pr-1 lg:flex"
      title={configuration?.databaseName ? `Connected to ${configuration.databaseName}` : undefined}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          configuration?.isActive ? "bg-success" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className="font-mono text-[11px] text-muted-foreground">{GATEWAY_LABEL}</span>
      <button
        type="button"
        onClick={copyEndpoint}
        aria-label={copied ? "Endpoint copied" : "Copy endpoint"}
        title={endpoint}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
};
