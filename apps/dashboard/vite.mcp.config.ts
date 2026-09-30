import { defineConfig, mergeConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"
import dashboardConfig from "./vite.config"

export default defineConfig((env) => mergeConfig(dashboardConfig(env), {
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist-mcp",
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: { input: "mcp-app.html" },
  },
}))
