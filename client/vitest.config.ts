import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Use the automatic JSX runtime for the test transform. The app relies on
  // `@vitejs/plugin-react` (vite.config.ts), but vitest.config.ts is standalone
  // and doesn't load it; without this, esbuild falls back to the classic runtime
  // and every .tsx test throws `React is not defined`.
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./app/test-utils/setup.ts"],
    server: {
      deps: {
        // genesis-os reads `import.meta.env`, which only exists in modules Vite
        // transforms. Externalised (the default for node_modules) it resolves to
        // undefined and the package throws at import time, taking whole test
        // files down before a single test runs.
        inline: ["@seliseblocks/genesis-os"],
      },
    },
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "lcov"],
      provider: "v8",
      reporter: ["text-summary", "text", "json-summary"],
      include: ["app/**/*.{ts,tsx}"],
      exclude: [
        "app/**/*.test.*",
        "app/**/*.spec.*",
        "app/**/*.d.ts",
        "app/**/main.tsx",
        "app/**/vite-env.d.ts",
        "**/components/ui/**",
        "app/**/*.stories.*",
        "**/__generated__/**",
        "**/*.gen.*",
        // Test-only helpers / mocks — not product code.
        "app/test-utils/**",
        "**/test-utils/**",
        "**/__mocks__/**",
      ],
    },
  },
  resolve: {
    alias: {
      // jsdom is a browser, but vitest resolves node_modules with the "node"
      // export condition, which hands us rollbar's server build. That one calls
      // `process.listeners` at construction and throws under jsdom, taking the
      // importing test file with it.
      rollbar: path.resolve(__dirname, "./node_modules/rollbar/src/browser/rollbar.js"),
      "@": path.resolve(__dirname, "./app"),
      "@blocks-idp": path.resolve(__dirname, "./app/idp"),
    },
  },
});
