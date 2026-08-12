import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/slack.ts"],
  format: ["esm"],
  dts: true,
});
