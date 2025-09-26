import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    sequence: { hooks: "list" },
    globals: false,
    testTimeout: process.env.SMOKE === "1" ? 30000 : 5000,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "lcov"],
    },
  },
});
