#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "packages", "plugin", "scaffold");
const packaging = join(root, "packaging", "codex");
const target = join(root, "dist", "language-coach");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const entry of ["assets", "skills"]) {
  await cp(join(source, entry), join(target, entry), { recursive: true });
}

await mkdir(join(target, ".codex-plugin"), { recursive: true });
await cp(join(packaging, "plugin.json"), join(target, ".codex-plugin", "plugin.json"));
await cp(join(packaging, "mcp.json"), join(target, ".mcp.json"));
await mkdir(join(target, "hooks"), { recursive: true });
await cp(join(packaging, "hooks.json"), join(target, "hooks", "hooks.json"));
for (const hook of ["user-prompt-submit.mjs", "stop.mjs"]) {
  await cp(join(root, "packages", "plugin", "dist", "hooks", hook), join(target, "hooks", hook));
}
await mkdir(join(target, "mcp"), { recursive: true });
await cp(join(root, "apps", "server", "dist", "server.mjs"), join(target, "mcp", "server.mjs"));
await mkdir(join(target, "dashboard"), { recursive: true });
await cp(join(root, "apps", "dashboard", "dist"), join(target, "dashboard", "dist"), { recursive: true });

const manifestPath = join(target, ".codex-plugin", "plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const cachebuster = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
manifest.version = `${rootPackage.version}+codex.${cachebuster}`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const relativePath of [
  ".codex-plugin/plugin.json", ".mcp.json", "assets/icon.png", "assets/logo.png",
  "hooks/hooks.json", "hooks/user-prompt-submit.mjs", "hooks/stop.mjs",
  "skills/language-coach/SKILL.md", "mcp/server.mjs", "dashboard/dist/index.html",
]) {
  await readFile(join(target, relativePath));
}

const mcp = JSON.parse(await readFile(join(target, ".mcp.json"), "utf8"));
const hooks = JSON.parse(await readFile(join(target, "hooks", "hooks.json"), "utf8"));
if (
  manifest.name !== "language-coach"
  || manifest.mcpServers !== "./.mcp.json"
  || mcp.mcpServers?.languageCoach?.args?.[0] !== "./mcp/server.mjs"
  || !hooks.hooks?.UserPromptSubmit
  || !hooks.hooks?.Stop
) {
  throw new Error("The assembled Codex plugin is invalid.");
}

process.stdout.write(`Built ${target}\n`);
