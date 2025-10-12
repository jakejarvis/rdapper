import { defineConfig } from "tsdown";

export default defineConfig({
  platform: "node",
  entry: ["src/index.ts"],
  dts: true,
  nodeProtocol: "strip",
  external: ["tldts"],
});
