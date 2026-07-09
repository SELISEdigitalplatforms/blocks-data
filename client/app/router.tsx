import { createBrowserRouter, Navigate, Outlet, RouteObject } from "react-router-dom";

// Dashboard routes (protected)
import DataGatewayLogsPage from "./routes/dashboard/data-gateway-logs";
import DataGatewayPlaygroundPage from "./routes/dashboard/data-gateway-playground";
import DataGatewaySchemasPage from "./routes/dashboard/data-gateway-schemas";
import DataGatewayEditDataSourcePage from "./routes/dashboard/data-gateway-edit-data-source";
import StoragePage from "./routes/dashboard/storage-page";

// Console pages
import {
  AuthResolver,
  CallbackPage,
  ConsoleLayout,
  ConsolePage,
  DashboardOverview,
  EnvironmentsPage,
  LoginPage,
  ProfilePage,
  ProtectedGuard,
  PublicGuard,
} from "@seliseblocks/blocks-kit";
import { DashboardRoute, ProjectOverviewRoute } from "@seliseblocks/blocks-kit/layouts";
import { navigationMenus } from "./constants/navigation-menus";

const redirectPaths: Record<string, string> = {
  "/app/*/data-gateway*": "/app/data-gateway",
  "/app/*/storage*": "/app/storage",
};

export const router = createBrowserRouter([
  {
    element: <Outlet />,
    children: [
      // All callback/redirect URLs handled here (unguarded, outside AuthResolver)
      {
        path: "/login/callback",
        element: <CallbackPage defaultRedirectUrl="/app/console" />,
      },

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
            children: [{ path: "/login", element: <LoginPage /> }],
          },

          // protected
          {
            path: "/app",
            element: (
              <ProtectedGuard>
                <Outlet />
              </ProtectedGuard>
            ),
            children: [
              {
                element: (
                  <ConsoleLayout>
                    <Outlet />
                  </ConsoleLayout>
                ),
                children: [
                  { path: "profile", element: <ProfilePage /> },
                  { path: "console", element: <ConsolePage /> },
                ],
              },
              { index: true, element: <Navigate to="console" replace /> },

              {
                path: "project/:tenantGroupId",
                element: (
                  <ProjectOverviewRoute
                    redirectPaths={redirectPaths}
                    navigationMenus={navigationMenus}
                  />
                ),
                children: [
                  {
                    index: true,
                    element: <Navigate to="environments" replace />,
                  },
                  {
                    path: "environments",
                    element: <EnvironmentsPage />,
                  },
                ],
              },
              {
                path: ":itemId",
                element: (
                  <DashboardRoute
                    redirectPaths={redirectPaths}
                    navigationMenus={navigationMenus}
                  />
                ),
                children: [
                  { index: true, element: <Navigate to="dashboard" replace /> },
                  { path: "dashboard", element: <DashboardOverview /> },
                  {
                    path: "data-gateway",
                    element: <DataGatewaySchemasPage />,
                  },
                  {
                    path: "data-gateway/playground",
                    element: <DataGatewayPlaygroundPage />,
                  },
                  {
                    path: "data-gateway/logs",
                    element: <DataGatewayLogsPage />,
                  },
                  {
                    path: "data-gateway/configuration",
                    element: <DataGatewayEditDataSourcePage />,
                  },
                  { path: "storage", element: <StoragePage /> },
                ],
              },
            ],
          },

          { path: "/", element: <Navigate to="/app/console" replace /> },
          { path: "*", element: <Navigate to="/login" replace /> },
        ],
      },
    ],
  },
] as const satisfies RouteObject[])