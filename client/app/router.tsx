import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

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
  DashboardLayout,
  DashboardOverview,
  EnvironmentsPage,
  LoginPage,
  ProfilePage,
  ProjectOverviewLayout,
  ProtectedGuard,
  PublicGuard,
} from "@seliseblocks/blocks-kit";
import { navigationMenus } from "./constants/navigation-menus";

const redirectPaths: Record<string, string> = {
  "/app/services/data-gateway*": "/app/services/data-gateway",
  "/app/services/storage*": "/app/services/storage",
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
          // Callback inside AuthResolver but outside guards
          {
            path: "/dashboard/callback",
            element: <CallbackPage defaultRedirectUrl="/app/dashboard" />,
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
              {
                path: "project-overview",
                element: (
                  <ProjectOverviewLayout
                    redirectPaths={redirectPaths}
                    navigationMenus={navigationMenus}
                  >
                    <Outlet />
                  </ProjectOverviewLayout>
                ),
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
                  <DashboardLayout
                    redirectPaths={redirectPaths}
                    navigationMenus={navigationMenus}
                  >
                    <Outlet />
                  </DashboardLayout>
                ),
                children: [
                  { path: "dashboard", element: <DashboardOverview /> },
                  {
                    path: "services/data-gateway",
                    element: <DataGatewaySchemasPage />,
                  },
                  {
                    path: "services/data-gateway/playground",
                    element: <DataGatewayPlaygroundPage />,
                  },
                  {
                    path: "services/data-gateway/logs",
                    element: <DataGatewayLogsPage />,
                  },
                  {
                    path: "services/data-gateway/configuration",
                    element: <DataGatewayEditDataSourcePage />,
                  },
                  { path: "services/storage", element: <StoragePage /> },
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
]);
