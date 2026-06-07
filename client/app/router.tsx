import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { DashboardLayout } from "./layouts/dashboard-layout";

// Dashboard routes (protected)
import DataGatewayLogsPage from "./routes/dashboard/data-gateway-logs";
import DataGatewayPlaygroundPage from "./routes/dashboard/data-gateway-playground";
import DataGatewaySchemasPage from "./routes/dashboard/data-gateway-schemas";
import StoragePage from "./routes/dashboard/storage-page";

// Console pages
import { Console } from "./pages/console/console";
import { DashboardOverview } from "./pages/dashboard/dashboard-overview";
import {
  AuthResolver,
  PublicGuard,
  LoginPage,
  ProtectedGuard,
  ConsoleLayout,
  ImpersonationChecker,
  ImpersonationTerminator,
  ImpersonationSynchronizer,
  CallbackPage,
  ConsolePage,
} from "@seliseblocks/blocks-kit";
import ProfilePage from "./routes/dashboard/profile";
import { ProjectOverviewLayout } from "./layouts/project-overview-layout";

export const router = createBrowserRouter([
  {
    // Set User Auth Information and resolve authentication state before rendering any route
    element: (
      <AuthResolver>
        <Outlet />
      </AuthResolver>
    ),
    children: [
      // public
      {
        element: (
          <PublicGuard>
            <Outlet />
          </PublicGuard>
        ),
        children: [
          { path: "/login", element: <LoginPage /> },
          {
            path: "/login/callback",
            element: <CallbackPage redirectUrl="/console" />,
          },
        ],
      },

      // protected
      {
        element: (
          <ProtectedGuard>
            <Outlet />
          </ProtectedGuard>
        ),
        children: [
          {
            element: (
              <ImpersonationChecker>
                <ImpersonationTerminator>
                  {/* <ConsoleLayout> */}
                  <Outlet />
                  {/* </ConsoleLayout> */}
                </ImpersonationTerminator>
              </ImpersonationChecker>
            ),
            children: [
              {
                element: (
                  <ConsoleLayout>
                    <Outlet />
                  </ConsoleLayout>
                ),
                children: [
                  { path: "/profile", element: <ProfilePage /> },
                  { path: "/console", element: <ConsolePage /> },
                ],
              },
              {
                path: "/project-overview/environments",
                element: <ProjectOverviewLayout />,
              },
            ],
          },
          {
            // impersonate
            element: (
              <ImpersonationChecker>
                <ImpersonationSynchronizer>
                  <DashboardLayout />
                </ImpersonationSynchronizer>
              </ImpersonationChecker>
            ),
            children: [
              { path: "/dashboard", element: <DashboardOverview /> },
              {
                path: "/dashboard/callback",
                element: <CallbackPage redirectUrl="/dashboard" />,
              },
              {
                path: "/services/data-gateway",
                element: <DataGatewaySchemasPage />,
              },
              {
                path: "/services/data-gateway/playground",
                element: <DataGatewayPlaygroundPage />,
              },
              {
                path: "/services/data-gateway/logs",
                element: <DataGatewayLogsPage />,
              },
              { path: "/services/storage", element: <StoragePage /> },
            ],
          },
        ],
      },

      { path: "/", element: <Navigate to="/console" replace /> },

      // ── Catch-all: redirect to login ──
      { path: "*", element: <Navigate to="/login" replace /> },
    ],
  },
]);
