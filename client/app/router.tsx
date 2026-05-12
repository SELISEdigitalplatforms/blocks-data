import { createBrowserRouter, Navigate } from "react-router-dom";

import { ConsoleLayout } from "./layouts/console-layout";
import { DashboardLayout } from "./layouts/dashboard-layout";
import { ProjectOverviewLayout } from "./layouts/project-overview-layout";


// Dashboard routes (protected)
import ApiSettingsPage from "./routes/dashboard/api-settings";
import AuthLogsPage from "./routes/dashboard/auth-logs";
import AuthenticationConfigPage from "./routes/dashboard/authentication-config";
import DataGatewayLogsPage from "./routes/dashboard/data-gateway-logs";
import DataGatewayPlaygroundPage from "./routes/dashboard/data-gateway-playground";
import DataGatewaySchemasPage from "./routes/dashboard/data-gateway-schemas";
import IamPage from "./routes/dashboard/iam";
import IamAddPermissionPage from "./routes/dashboard/iam-add-permission";
import IamConfigurePage from "./routes/dashboard/iam-configure";
import IamLogsPage from "./routes/dashboard/iam-logs";
import IamOrgDetailPage from "./routes/dashboard/iam-org-detail";
import IamPermissionDetailPage from "./routes/dashboard/iam-permission-detail";
import IamRoleDetailPage from "./routes/dashboard/iam-role-detail";
import IamUserDetailPage from "./routes/dashboard/iam-user-detail";
import MfaLogsPage from "./routes/dashboard/mfa-logs";
import PlatformServiceLogsPage from "./routes/dashboard/platform-service-logs";
import ProfilePage from "./routes/dashboard/profile";
import RateLimiterPage from "./routes/dashboard/rate-limiter";
import SsoConfigurationPage from "./routes/dashboard/sso-configuration";
import StoragePage from "./routes/dashboard/storage-page";


// Console pages
import { Console } from "./pages/console/console";
import { CreateProjectWrapper } from "./pages/create-project/create-project";
import { DashboardOverview } from "./pages/dashboard/dashboard-overview";
import { EnvironmentsPage } from "./pages/environments/environments";
import { PeopleManagement } from "./pages/people/people-management";
import { RepositoriesPage } from "./pages/repositories/repositories";
import { SettingsPage } from "./pages/settings/settings";
import LoginCallbackPage from "./routes/auth/callback";
import LoginSimplePage from "./routes/auth/login-simple";
import CallbackPage from "./routes/callback/callback";


export const router = createBrowserRouter([
  // ── IDP service login (initiates OIDC flow + handles callback) ──
  {
    path: "/login",
    children: [
      { index: true, element: <LoginSimplePage /> },
      { path: "callback", element: <LoginCallbackPage /> },
    ],
  },

   // ── Console layout (profile, console pages without sidebar) ──
  {
    element: <ConsoleLayout />,
    children: [
      { path: "/profile", element: <ProfilePage /> },
      { path: "/console", element: <Console /> },
      { path: "/create-project", element: <CreateProjectWrapper /> },
      { path: "/callback", element: <CallbackPage /> },
    ],
  },

  // ── Dashboard and project overview in dashboard layout (consolidated sidebar) ──
  {
    element: <ProjectOverviewLayout />,
    children: [
      { path: "/dashboard", element: <DashboardOverview /> },
      { path: "/project-overview", element: <Navigate to="/project-overview/environments" replace /> },
      { path: "/project-overview/environments", element: <EnvironmentsPage /> },
      { path: "/project-overview/people", element: <PeopleManagement /> },
      { path: "/project-overview/repositories", element: <RepositoriesPage /> },
      { path: "/project-overview/settings", element: <SettingsPage /> },
    ],
  },
 


  // ── Dashboard layout (protected routes) ──
  {
    element: <DashboardLayout />,
    children: [
      { path: "/services/iam", element: <IamPage /> },
      { path: "/services/iam/user-detail/:id", element: <IamUserDetailPage /> },
      { path: "/services/iam/role-detail/:id", element: <IamRoleDetailPage /> },
      { path: "/services/iam/permission-detail/new", element: <IamAddPermissionPage /> },
      { path: "/services/iam/permission-detail/:id", element: <IamPermissionDetailPage /> },
      { path: "/services/iam/organization-detail/:itemId", element: <IamOrgDetailPage /> },
      { path: "/services/iam/logs", element: <IamLogsPage /> },
      { path: "/services/iam/configure", element: <IamConfigurePage /> },
      { path: "/services/authentication", element: <AuthenticationConfigPage /> },
      { path: "/services/authentication/sso-configuration", element: <SsoConfigurationPage /> },
      { path: "/services/authentication/logs", element: <AuthLogsPage /> },
      { path: "/services/mfa", element: <Navigate to="/services/secret-management?tab=mfa" replace /> },
      { path: "/services/mfa/logs", element: <MfaLogsPage /> },
      { path: "/services/api-settings", element: <ApiSettingsPage /> },
      { path: "/services/rate-limiter", element: <RateLimiterPage /> },
      { path: "/services/logs/:serviceName", element: <PlatformServiceLogsPage /> },
      { path: "/services/data-gateway", element: <DataGatewaySchemasPage /> },
      { path: "/services/data-gateway/playground", element: <DataGatewayPlaygroundPage /> },
      { path: "/services/data-gateway/logs", element: <DataGatewayLogsPage /> },
      { path: "/services/storage", element: <StoragePage /> },
    ],
  },

  // ── Root redirect: authenticated users go to console ──
  { path: "/", element: <Navigate to="/console" replace /> },

  // ── Catch-all: redirect to login ──
  { path: "*", element: <Navigate to="/login" replace /> },
]);
