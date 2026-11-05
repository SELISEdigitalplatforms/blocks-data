/**
 * i18n modules. English lives here (`<module>.en.json`); other languages come from the
 * localization service.
 *
 * - `data.console` (286 keys): constants, identifier, notifications, service-logs, pages, routes, main.tsx, router.tsx
 * - `data.gateway.access` (193 keys): data-gateway/components, data-gateway/constants
 * - `data.gateway.analytics` (163 keys): data-gateway/pages
 * - `data.gateway.schema` (607 keys): data-gateway (components, constants, hooks, models, services, utils)
 * - `data.gateway.validation` (384 keys): data-gateway/components, data-gateway/constants, data-gateway/utils
 * - `data.idp.authentication` (520 keys): idp/authentication
 * - `data.idp.iam` (510 keys): idp/iam
 * - `data.idp.security` (62 keys): idp/api-settings, idp/captcha, idp/mfa
 * - `data.shared` (155 keys): components, constants, contexts, guards, hooks, layouts, lib, models, providers, services, store
 * - `data.storage` (252 keys): storage
 * Total: 3132 keys.
 */
import { registerTranslations } from "@seliseblocks/genesis-os/i18n";
import consoleApp from "./data.console.en.json";
import gatewayAccess from "./data.gateway.access.en.json";
import gatewayAnalytics from "./data.gateway.analytics.en.json";
import gatewaySchema from "./data.gateway.schema.en.json";
import gatewayValidation from "./data.gateway.validation.en.json";
import idpAuthentication from "./data.idp.authentication.en.json";
import idpIam from "./data.idp.iam.en.json";
import idpSecurity from "./data.idp.security.en.json";
import shared from "./data.shared.en.json";
import storage from "./data.storage.en.json";

registerTranslations("data.console", consoleApp);
registerTranslations("data.gateway.access", gatewayAccess);
registerTranslations("data.gateway.analytics", gatewayAnalytics);
registerTranslations("data.gateway.schema", gatewaySchema);
registerTranslations("data.gateway.validation", gatewayValidation);
registerTranslations("data.idp.authentication", idpAuthentication);
registerTranslations("data.idp.iam", idpIam);
registerTranslations("data.idp.security", idpSecurity);
registerTranslations("data.shared", shared);
registerTranslations("data.storage", storage);
