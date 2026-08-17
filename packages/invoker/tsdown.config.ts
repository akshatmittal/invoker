import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/github.ts"],
  format: ["esm"],
  dts: true,
});
