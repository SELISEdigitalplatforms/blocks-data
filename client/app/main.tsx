import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { NuqsAdapter } from "nuqs/adapters/react-router/v6";
import { Toaster } from "./components/ui-kits/toaster/toaster";
import { TooltipProvider } from "./components/ui-kits/tooltip/tooltip";
import QueryProvider from "./providers/query-provider";
import { router } from "./router";
import "./styles/globals.css";
import { BlocksAppLayout } from "@seliseblocks/blocks-kit";

import applightlogo from "./../public/blocks-logos/Logo_Black.svg";
import appblacklogo from "./../public/blocks-logos/Logo_White.svg";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <NuqsAdapter>
        <TooltipProvider>
          <BlocksAppLayout
            config={{
              userBaseUrlKey: "BLOCKS_IAM_BASE_URL",
              projectBaseUrlKey: "BLOCKS_LOGIC_BASE_URL",
              appLogoUrl: {
                dark: applightlogo,
                light: appblacklogo,
              },
            }}
          >
            <RouterProvider router={router} />
          </BlocksAppLayout>
          <Toaster />
        </TooltipProvider>
      </NuqsAdapter>
    </QueryProvider>
  </StrictMode>,
);
