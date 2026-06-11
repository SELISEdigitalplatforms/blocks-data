import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { DashboardLayout } from "./layouts/dashboard-layout";

// Dashboard routes (protected)
import DataGatewayLogsPage from "./routes/dashboard/data-gateway-logs";
import DataGatewayPlaygroundPage from "./routes/dashboard/data-gateway-playground";
import DataGatewaySchemasPage from "./routes/dashboard/data-gateway-schemas";
import StoragePage from "./routes/dashboard/storage-page";

// Console pages
import {
  AuthResolver,
  CallbackPage,
  ConsoleLayout,
  ConsolePage,
  ImpersonationChecker,
  ImpersonationSynchronizer,
  ImpersonationTerminator,
  LoginPage,
  ProfilePage,
  ProtectedGuard,
  PublicGuard,
} from "@seliseblocks/blocks-kit";
import { ProjectOverviewLayout } from "./layouts/project-overview-layout";
import { DashboardOverview } from "./pages/dashboard/dashboard-overview";
import { EnvironmentsPage } from "./pages/environments/environments";

export const router = createBrowserRouter([
  {
    element: <Outlet />,
    children: [
      // All callback/redirect URLs handled here (unguarded, outside AuthResolver)
      {
        path: "/login/callback",
        element: <CallbackPage redirectUrl="/console" />,
      },

      {
        // Set User Auth Information and resolve authentication state before rendering any route
        element: (
          <AuthResolver>
            <Outlet />
          </AuthResolver>
        ),
        children: [
          // Callback inside AuthResolver but outside guards
          {
            path: "/dashboard/callback",
            element: <CallbackPage redirectUrl="/dashboard" />,
          },

          // public
          {
            element: (
              <PublicGuard>
                <Outlet />
              </PublicGuard>
            ),
            children: [{ path: "/login", element: <LoginPage /> }],
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
                      <ConsoleLayout>
                        <Outlet />
                      </ConsoleLayout>
                    </ImpersonationTerminator>
                  </ImpersonationChecker>
                ),
                children: [
                  { path: "/profile", element: <ProfilePage /> },
                  { path: "/console", element: <ConsolePage /> },
                ],
              },
              {
                path: "/project-overview",
                element: <ProjectOverviewLayout />,
                children: [
                  {
                    path: "environments",
                    element: <EnvironmentsPage />,
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
          { path: "*", element: <Navigate to="/login" replace /> },
        ],
      },
    ],
  },
]);
