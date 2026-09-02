import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: [
    "src/hooks/user-prompt-submit.ts",
    "src/hooks/stop.ts",
    "src/hooks/cursor-session-start.ts",
    "src/hooks/cursor-stop.ts",
  ],
  outdir: "dist/hooks",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  minify: true,
  platform: "node",
  target: "node22",
});
