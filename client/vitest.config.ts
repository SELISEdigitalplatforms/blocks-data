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
      "@": path.resolve(__dirname, "./app"),
      "@blocks-idp": path.resolve(__dirname, "./app/idp"),
    },
  },
});
