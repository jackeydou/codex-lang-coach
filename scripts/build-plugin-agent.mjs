#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "packages", "plugin", "scaffold");
const packaging = join(root, "packaging", "agent-plugin");
const target = join(root, "dist-agent", "language-coach");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const entry of ["assets", "skills"]) {
  await cp(join(source, entry), join(target, entry), { recursive: true });
}

await cp(join(packaging, "plugin.json"), join(target, "plugin.json"));
await cp(join(packaging, "mcp.json"), join(target, "mcp.json"));
await mkdir(join(target, "mcp"), { recursive: true });
await cp(join(root, "apps", "server", "dist", "server.mjs"), join(target, "mcp", "server.mjs"));
await mkdir(join(target, "dashboard"), { recursive: true });
await cp(join(root, "apps", "dashboard", "dist"), join(target, "dashboard", "dist"), { recursive: true });

const manifestPath = join(target, "plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
manifest.version = rootPackage.version;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const relativePath of [
  "plugin.json", "mcp.json", "assets/icon.png", "assets/logo.png",
  "skills/language-coach/SKILL.md", "mcp/server.mjs", "dashboard/dist/index.html",
]) {
  await readFile(join(target, relativePath));
}

const mcp = JSON.parse(await readFile(join(target, "mcp.json"), "utf8"));
if (
  manifest.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
  || manifest.name !== "language-coach"
  || mcp.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
  || mcp.mcpServers?.languageCoach?.type !== "stdio"
) {
  throw new Error("The assembled Agent Plugin is invalid.");
}

process.stdout.write(`Built ${target}\n`);
