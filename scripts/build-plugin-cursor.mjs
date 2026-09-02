#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "packages", "plugin", "scaffold");
const packaging = join(root, "packaging", "cursor");
const target = join(root, "dist-cursor", "language-coach");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const entry of ["assets", "skills"]) {
  await cp(join(source, entry), join(target, entry), { recursive: true });
}

await mkdir(join(target, ".cursor-plugin"), { recursive: true });
await cp(join(packaging, "plugin.json"), join(target, ".cursor-plugin", "plugin.json"));
await cp(join(packaging, "mcp.json"), join(target, "mcp.json"));
await mkdir(join(target, "hooks"), { recursive: true });
await cp(join(packaging, "hooks.json"), join(target, "hooks", "hooks.json"));
for (const hook of ["cursor-session-start.mjs", "cursor-stop.mjs"]) {
  await cp(join(root, "packages", "plugin", "dist", "hooks", hook), join(target, "hooks", hook));
}
await mkdir(join(target, "mcp"), { recursive: true });
await cp(join(root, "apps", "server", "dist", "server.mjs"), join(target, "mcp", "server.mjs"));
await mkdir(join(target, "dashboard"), { recursive: true });
await cp(join(root, "apps", "dashboard", "dist"), join(target, "dashboard", "dist"), { recursive: true });

const manifestPath = join(target, ".cursor-plugin", "plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const cachebuster = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
manifest.version = `${rootPackage.version}+cursor.${cachebuster}`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const relativePath of [
  ".cursor-plugin/plugin.json", "mcp.json", "assets/icon.png", "assets/logo.png",
  "hooks/hooks.json", "hooks/cursor-session-start.mjs", "hooks/cursor-stop.mjs",
  "skills/language-coach/SKILL.md", "mcp/server.mjs", "dashboard/dist/index.html",
]) {
  await readFile(join(target, relativePath));
}

const mcp = JSON.parse(await readFile(join(target, "mcp.json"), "utf8"));
const hooks = JSON.parse(await readFile(join(target, "hooks", "hooks.json"), "utf8"));
if (
  manifest.name !== "language-coach"
  || manifest.hooks !== "./hooks/hooks.json"
  || manifest.mcpServers !== "./mcp.json"
  || mcp.mcpServers?.languageCoach?.args?.[0] !== "${CURSOR_PLUGIN_ROOT}/mcp/server.mjs"
  || !hooks.hooks?.sessionStart
  || !hooks.hooks?.stop
) {
  throw new Error("The assembled Cursor plugin is invalid.");
}

process.stdout.write(`Built ${target}\n`);
