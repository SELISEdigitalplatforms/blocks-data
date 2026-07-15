import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./app/test-utils/setup.ts"],
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    coverage: {
      all: true,
      provider: "v8",
      reporter: ["text-summary", "text"],
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
