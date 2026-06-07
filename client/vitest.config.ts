import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
      "@blocks-idp": path.resolve(__dirname, "./app/idp"),
    },
  },
});
