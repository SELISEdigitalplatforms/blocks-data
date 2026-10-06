import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";

// Local dev HTTPS, driven ONLY by the machine env vars DATA_SSL_CERT /
// DATA_SSL_KEY (abs paths to an mkcert PEM cert + key). Read directly
// from process.env — NOT loadEnv, which is BLOCKS_-prefixed and would hide
// these non-prefixed names. Both set AND both files present -> HTTPS;
// otherwise warn and fall back to HTTP (returns undefined). Never throws.
// NOTE: this is consumed only by Vite's `server` block (the dev server). It is
// not referenced by `vite build`, so the built/deployed artifact is unaffected.
// `undefined` (not `false`) is the HTTP value: Vite 6 types `server.https` as
// `https.ServerOptions | undefined`, and vite.config.ts is type-checked by
// `tsc -b` (tsconfig.node.json, strict) during `npm run build`.
function resolveDevHttps(): { cert: Buffer; key: Buffer } | undefined {
  const certPath = process.env.DATA_SSL_CERT;
  const keyPath = process.env.DATA_SSL_KEY;

  if (!certPath || !keyPath) {
    console.warn(
      "[dev-https] DATA_SSL_CERT / DATA_SSL_KEY not set — serving HTTP.",
    );
    return undefined;
  }
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.warn(
      `[dev-https] cert/key file missing (cert=${certPath}, key=${keyPath}) — serving HTTP.`,
    );
    return undefined;
  }
  return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
}

/** Rollup rejects `/*#__PURE__*\/` immediately before `function` in @microsoft/signalr Utils.js */
const stripSignalrInvalidPureAnnotations = (): Plugin => ({
  name: "strip-signalr-invalid-pure-annotations",
  enforce: "pre",
  transform(code, id) {
    if (
      !id.includes("node_modules/@microsoft/signalr") ||
      !id.endsWith("Utils.js")
    ) {
      return null;
    }
    const patched = code.replace(
      /\/\/ eslint-disable-next-line spaced-comment\r?\n\/\*#__PURE__\*\/ function /g,
      "function ",
    );
    if (patched === code) return null;
    return { code: patched, map: null };
  },
});

/** Unfilled `__BLOCKS_*__` tokens (from runtime-config.js style templating) count as unset. */
const isPlaceholder = (value?: string) =>
  !!value && value.startsWith("__BLOCKS_") && value.endsWith("__");

/** Reads a BLOCKS_* value from `.env` / `.env.[mode]` / shell env (via loadEnv); "" when unset. */
const readEnv = (env: Record<string, string>, key: string): string => {
  const value = env[key]?.trim();
  return value && !isPlaceholder(value) ? value.replace(/\/$/, "") : "";
};

export default defineConfig(({ mode }) => {
  // Pick the backend environment with Vite's mode: `.env` (default), or e.g.
  // `vite --mode stg` -> `.env.stg`, `vite --mode prod` -> `.env.prod`.
  // Only the dev server uses these proxies; deployed builds are served by the API itself.
  const env = loadEnv(mode, __dirname, "BLOCKS_");

  const apiProxyTarget =
    readEnv(env, "BLOCKS_DATA_BASE_URL") || readEnv(env, "BLOCKS_API_BASE_URL");
  const iamProxyTarget = readEnv(env, "BLOCKS_IAM_BASE_URL");
  const devPort = Number(env.BLOCKS_DEV_PORT) || 4000;

  if (!apiProxyTarget) {
    console.warn(
      "[dev-proxy] BLOCKS_DATA_BASE_URL / BLOCKS_API_BASE_URL not set — API routes are not proxied.",
    );
  }
  if (!iamProxyTarget) {
    console.warn("[dev-proxy] BLOCKS_IAM_BASE_URL not set — IAM routes are not proxied.");
  }

  const apiProxy = { target: apiProxyTarget, changeOrigin: true, secure: false };

  return {
    envPrefix: ["BLOCKS_"],
    define: {
      "process.env.NEXT_PUBLIC_API_BASE_URL": JSON.stringify(env.BLOCKS_API_BASE_URL ?? ""),
      "process.env.NEXT_PUBLIC_PROJECT_DEFAULT_API_BASE_URL": JSON.stringify(
        env.BLOCKS_API_BASE_URL ?? "",
      ),
    },
    plugins: [react(), stripSignalrInvalidPureAnnotations()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./app"),
        "@blocks-idp": path.resolve(__dirname, "./app/idp"),
      },
    },
    server: {
      host: true, // Listen on all addresses (0.0.0.0)
      port: devPort,
      strictPort: true, // Exit if the port is already in use
      https: resolveDevHttps(), // HTTPS when DATA_SSL_* are set; else HTTP
      fs: {
        allow: [path.resolve(__dirname, "..")],
      },
      allowedHosts: [
        "dev-cloud.seliseblocks.com",
        "localhost",
        ".seliseblocks.com",
        ".blocksdevelopers.com",
      ],
      proxy: {
        ...(iamProxyTarget
          ? {
              "/dev-iam-proxy": {
                target: iamProxyTarget,
                changeOrigin: true,
                secure: true,
                rewrite: (path: string) => path.replace(/^\/dev-iam-proxy/, ""),
              },
              "/dev-idp-proxy": {
                target: iamProxyTarget,
                changeOrigin: true,
                secure: true,
                rewrite: (path: string) => path.replace(/^\/dev-idp-proxy/, ""),
              },
            }
          : {}),
        ...(apiProxyTarget
          ? {
              "/api": apiProxy,
              "/cloudbuild": apiProxy,
              "/idp": apiProxy,
              "/identifier": apiProxy,
              "/communication": apiProxy,
              "/cloudconfiguration": apiProxy,
              "/uilm": apiProxy,
              "/utilities": apiProxy,
              "/lmt": apiProxy,
              "/mfa": apiProxy,
              "/alert": apiProxy,
              "/blocksai-api": apiProxy,
              "/studio": apiProxy,
              "/DATA": apiProxy,
            }
          : {}),
      },
    },
    build: {
      outDir: "../server/Api/wwwroot",
      emptyOutDir: true,
    },
    optimizeDeps: {
      include: [
        "graphql",
        "monaco-editor",
        "@monaco-editor/react",
        "graphiql",
        "monaco-graphql",
      ],
    },
  };
});
