import { tStatic } from "@seliseblocks/genesis-os/i18n";
export interface BlocksProduct {
  /** Unique slug identifier, e.g. "blocks-iam", "blocks-os" */
  name: string;
  /** Display name, e.g. "blocks IAM" */
  appName: string;
  /** Short badge label shown on the carousel card */
  badge: string;
  /** One-line tagline */
  tagline: string;
  /** Carousel card description (keep concise) */
  shortDescription: string;
  /** Full-length description for detail views */
  description: string;
  /** Feature chip labels */
  featureChips: string[];
  /** Link target for the CTA button */
  url: string;
  /** CTA button label, e.g. "Visit blocks IAM" */
  cta: string;
}

export const BLOCKS_PRODUCTS: BlocksProduct[] = [
  {
    name: "blocks-os",
    appName: "blocks OS",
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.PLATFORM_CORE"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.ENTERPRISE_APPLICATION_OPERATING"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.A_SECURE_PLANE_FOR_YOUR_APPLICATION"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_OS_IS_A_SECURE_ISOLATED"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.MULTI_TENANT_ISOLATION"), tStatic("data.console", "BLOCKS_PRODUCTS.SCOPED_SECRETS"), tStatic("data.console", "BLOCKS_PRODUCTS.AUDIT_TRAILS"), tStatic("data.console", "BLOCKS_PRODUCTS.LOG_TRACE_HANDLING"), tStatic("data.console", "BLOCKS_PRODUCTS.ROLE_BASED_ACCESS")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_OS"); },
  },
  {
    name: "blocks-localization",
    appName: "blocks Localization",
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.LOCALIZATION"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.LOCALIZATION_INFRASTRUCTURE_FOR_MODERN"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.MANAGE_MULTILINGUAL_INTERFACES_WITH_AI"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_LOCALIZATION_IS_A_KEY_BASED"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.BROWSER_EXTENSION"), tStatic("data.console", "BLOCKS_PRODUCTS.BULK_KEY_OPERATIONS"), tStatic("data.console", "BLOCKS_PRODUCTS.CONTEXT_AWARE_TRANSLATIONS"), tStatic("data.console", "BLOCKS_PRODUCTS.REAL_TIME_PUBLISHING")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_LOCALIZATION"); },
  },
  {
    name: "blocks-iam",
    appName: "blocks IAM",
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.IDENTITY"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.ENTERPRISE_IDENTITY_HANDLED_END_TO_END"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.UNIFIED_IDENTITY_AND_ACCESS_MANAGEMENT"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_IAM_IS_THE_UNIFIED_IDENTITY"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.SSO_IDP_INTEGRATION"), tStatic("data.console", "BLOCKS_PRODUCTS.MULTI_FACTOR_AUTH"), tStatic("data.console", "BLOCKS_PRODUCTS.ROLE_BASED_ACCESS"), tStatic("data.console", "BLOCKS_PRODUCTS.CAPTCHA_CLIENT_CREDENTIALS"), tStatic("data.console", "BLOCKS_PRODUCTS.MAGIC_LINKS")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_IAM"); },
  },
  {
    name: "blocks-data",
    appName: "blocks Data",
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.DATA"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.INSTANT_APIS_OVER_ANY_DATA_OPERATIONS"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.INSTANT_GRAPHQL_APIS_OVER_MANAGED_OR"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_DATA_GIVES_YOU_INSTANT_GRAPHQL"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.GRAPHQL_APIS"), tStatic("data.console", "BLOCKS_PRODUCTS.COLUMN_LEVEL_ACCESS"), tStatic("data.console", "BLOCKS_PRODUCTS.CRUD_PLAYGROUND"), tStatic("data.console", "BLOCKS_PRODUCTS.MULTI_PROVIDER_STORAGE"), tStatic("data.console", "BLOCKS_PRODUCTS.BRING_YOUR_OWN_DATABASE")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_DATA"); },
  },
  {
    name: "blocks-logic",
    appName: "blocks Logic",
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.AUTOMATION"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.AUTOMATE_WITHOUT_WRITING_CODE"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.ORCHESTRATE_MULTI_STEP_AUTOMATIONS"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_LOGIC_IS_A_VISUAL_WORKFLOW"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.DRAG_AND_DROP_BUILDER"), tStatic("data.console", "BLOCKS_PRODUCTS.WEBHOOK_EMAIL_TRIGGERS"), tStatic("data.console", "BLOCKS_PRODUCTS.AI_AGENT_NODE"), tStatic("data.console", "BLOCKS_PRODUCTS.HTTP_DATABASE_ACTIONS"), tStatic("data.console", "BLOCKS_PRODUCTS.CONDITIONAL_BRANCHING")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_LOGIC"); },
  },
  {
    name: "blocks-studio",
    appName: "blocks Studio",
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.AI_STUDIO"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.GENERATE_AI_POWERED_APPS_WITHIN_BLOCKS"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.GENERATE_WORKING_APPLICATIONS_FROM"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_STUDIO_IS_AN_AI_ENGINE"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.NATURAL_LANGUAGE_PROMPTS"), tStatic("data.console", "BLOCKS_PRODUCTS.AI_APP_GENERATION"), tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_AWARE_CONTEXT"), tStatic("data.console", "BLOCKS_PRODUCTS.INSTANT_PROTOTYPING"), tStatic("data.console", "BLOCKS_PRODUCTS.INTERNAL_TOOL_SCAFFOLDING")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_STUDIO"); },
  },
  {
    name: "blocks-agents",
    get appName() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_AGENTS"); },
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.AI_AGENTS"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.REASONING_AGENTS_FOR_EVERY_FRONTEND"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.CREATE_AND_DEPLOY_AI_AGENTS_WITH"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_AGENTS_LETS_YOU_CREATE"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.RAG_KNOWLEDGE_BASES"), tStatic("data.console", "BLOCKS_PRODUCTS.CUSTOM_LLM_MCP"), tStatic("data.console", "BLOCKS_PRODUCTS.EMBEDDABLE_SCRIPT_TAG"), tStatic("data.console", "BLOCKS_PRODUCTS.REASONING_AGENT_MODES"), tStatic("data.console", "BLOCKS_PRODUCTS.HUMAN_HANDOFF")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_AGENTS"); },
  },
  {
    name: "blocks-release",
    appName: "blocks Release",
    badge: "CI/CD",
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.SECURE_RELEASES_WITH_FASTER_PACE"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.MANAGE_END_TO_END_DEPLOYMENT_WITH"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_RELEASE_PROVIDES_END_TO_END"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.GIT_BASED_DEPLOYMENT"), tStatic("data.console", "BLOCKS_PRODUCTS.BRANCH_ENVIRONMENT_MAPPING"), tStatic("data.console", "BLOCKS_PRODUCTS.SCA_SAST_DAST"), tStatic("data.console", "BLOCKS_PRODUCTS.CI_CD_PIPELINES"), tStatic("data.console", "BLOCKS_PRODUCTS.ISO_COMPLIANCE")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_RELEASE"); },
  },
  {
    name: "blocks-monitor",
    appName: "blocks Monitor",
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.OBSERVABILITY"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.FULL_VISIBILITY_FROM_DAY_ONE"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.GET_BUILT_IN_OBSERVABILITY_WITH_REAL"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_MONITOR_DELIVERS_BUILT_IN"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.REAL_TIME_LOGS_WITH_AI"), tStatic("data.console", "BLOCKS_PRODUCTS.DISTRIBUTED_TRACING"), tStatic("data.console", "BLOCKS_PRODUCTS.USAGE_METRICS"), tStatic("data.console", "BLOCKS_PRODUCTS.HEALTH_MONITORING"), tStatic("data.console", "BLOCKS_PRODUCTS.ZERO_EXTERNAL_TOOLING")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_MONITOR"); },
  },
  {
    name: "blocks-utilities",
    appName: "blocks Utilities",
    get badge() { return tStatic("data.console", "BLOCKS_PRODUCTS.UTILITIES"); },
    get tagline() { return tStatic("data.console", "BLOCKS_PRODUCTS.COMMUNICATION_SERVICES_FOR_MODERN"); },
    get shortDescription() { return tStatic("data.console", "BLOCKS_PRODUCTS.SEND_BRANDED_EMAILS_REAL_TIME"); },
    get description() { return tStatic("data.console", "BLOCKS_PRODUCTS.BLOCKS_UTILITIES_PROVIDES_POWERFUL"); },
    get featureChips() { return [tStatic("data.console", "BLOCKS_PRODUCTS.BRANDED_EMAIL"), tStatic("data.console", "BLOCKS_PRODUCTS.REAL_TIME_NOTIFICATIONS"), tStatic("data.console", "BLOCKS_PRODUCTS.REDIRECT_MAGIC_LINKS"), tStatic("data.console", "BLOCKS_PRODUCTS.ACTION_MAGIC_LINKS"), tStatic("data.console", "BLOCKS_PRODUCTS.WORKFLOW_AUTOMATION")]; },
    url: "",
    get cta() { return tStatic("data.console", "BLOCKS_PRODUCTS.VISIT_BLOCKS_UTILITIES"); },
  },
];
