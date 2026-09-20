import { defineConfig } from "tsdown";

export default defineConfig({
  platform: "node",
  target: "node20",
  entry: ["src/index.ts"],
  clean: true,
  dts: true,
  exports: true,
  nodeProtocol: "strip",
  deps: { neverBundle: ["tldts"] },
  failOnWarn: true,
  suppressWarnings: ["TypeScript 7.0 does not yet have a stable API and is experimental"],
});
