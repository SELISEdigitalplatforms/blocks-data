import { BlocksAppLayout } from "@seliseblocks/blocks-kit";
import { NuqsAdapter } from "nuqs/adapters/react-router/v6";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "./components/ui-kits/toaster/toaster";
import { TooltipProvider } from "./components/ui-kits/tooltip/tooltip";
import { ThemeProvider } from "./hooks/use-theme";
import "./lib/resolve-env";
import QueryProvider from "./providers/query-provider";
import { router } from "./router";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
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
                  name: "blocks-data",
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
  </StrictMode>,
);
