import { defineConfig } from "tsdown";

export default defineConfig({
  platform: "node",
  target: "node20",
  entry: ["src/index.ts"],
  dts: true,
  nodeProtocol: "strip",
  deps: { neverBundle: ["tldts"] },
});
