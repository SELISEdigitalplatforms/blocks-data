import "./i18n";
import { BlocksAppLayout } from "@seliseblocks/genesis-os";
import {
  attachQueryErrorReporting,
  getRollbar,
  RollbarProvider,
} from "@seliseblocks/genesis-os/observability";
import { NuqsAdapter } from "nuqs/adapters/react-router/v8";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Toaster } from "./components/ui-kits/toaster/toaster";
import { TooltipProvider } from "./components/ui-kits/tooltip/tooltip";
import { SERVICE_NAME } from "./constants/service.constant";
import { ThemeProvider } from "./hooks/use-theme";
import "./lib/resolve-env";
import QueryProvider, { getQueryClient } from "./providers/query-provider";
import { router } from "./router";
import "./styles/globals.css";

// This app owns its QueryClient (providers/query-provider.tsx). RollbarProvider only instruments
// genesis-os's own shared client, so this explicit attach is the app's only react-query reporter.
attachQueryErrorReporting(getQueryClient(), getRollbar({ service: SERVICE_NAME }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RollbarProvider service={SERVICE_NAME}>
      <QueryProvider>
        <ThemeProvider>
          <NuqsAdapter>
            <TooltipProvider>
              <NuqsAdapter>
                <BlocksAppLayout
                  config={{
                    appLogoUrl: {
                      dark: "/blocks-logos/Logo_Black.svg",
                      light: "/blocks-logos/Logo_White.svg",
                    },
                    name: SERVICE_NAME,
                  }}
                >
                  <RouterProvider router={router} />
                </BlocksAppLayout>
                <Toaster />
              </NuqsAdapter>
            </TooltipProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </QueryProvider>
    </RollbarProvider>
  </StrictMode>,
);
