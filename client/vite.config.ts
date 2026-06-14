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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "BLOCKS_");
  const proxyTarget = env.BLOCKS_API_BASE_URL ?? "";

  return {
    envPrefix: ["BLOCKS_"],
    define: {
      "process.env.NEXT_PUBLIC_API_BASE_URL": JSON.stringify(proxyTarget),
      "process.env.NEXT_PUBLIC_PROJECT_DEFAULT_API_BASE_URL":
        JSON.stringify(proxyTarget),
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
      port: 4000,
      strictPort: true, // Exit if the port is already in use
      https: resolveDevHttps(), // HTTPS when DATA_SSL_* are set; else HTTP
      fs: {
        allow: [path.resolve(__dirname, "..")],
      },
      allowedHosts: [
        "dev-cloud.seliseblocks.com",
        "localhost",
        ".seliseblocks.com",
      ],
      proxy: {
        "/dev-iam-proxy": {
          target: "https://dev-iam.blocksdevelopers.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/dev-iam-proxy/, ""),
        },
        ...(proxyTarget
          ? {
              "/api": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/cloudbuild": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/idp": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/identifier": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/communication": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/cloudconfiguration": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/uilm": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/utilities": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/lmt": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/mfa": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/alert": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/blocksai-api": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/studio": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
              "/DATA": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
              },
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
