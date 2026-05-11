/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BLOCKS_API_BASE_URL: string;
  readonly BLOCKS_NOTIFICATION_BASE_URL: string;
  readonly BLOCKS_GRAPHQL_GATEWAY_ORIGIN: string;
  readonly BLOCKS_UTILITY_API_ORIGIN: string;
  readonly BLOCKS_X_BLOCKS_KEY: string;
  readonly BLOCKS_GOOGLE_SITE_KEY: string;
  readonly BLOCKS_CONSTRUCT_URL: string;
  readonly BLOCKS_CLOUD_DASHBOARD_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
