import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**", "**/*.smoke.test.ts"],
    sequence: { hooks: "list" },
    globals: false,
    testTimeout: 5000,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "lcov"],
      exclude: ["**/__tests__/**", "src/**/index.ts"],
    },
  },
});
