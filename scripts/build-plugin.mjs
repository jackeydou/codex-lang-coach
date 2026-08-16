#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "packages", "plugin", "scaffold");
const target = join(root, "dist", "language-coach");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const entry of [".codex-plugin", ".mcp.json", "hooks", "skills"]) {
  await cp(join(source, entry), join(target, entry), { recursive: true });
}

await cp(
  join(root, "packages", "plugin", "dist", "hooks"),
  join(target, "hooks"),
  { recursive: true },
);
await mkdir(join(target, "mcp"), { recursive: true });
await cp(
  join(root, "apps", "server", "dist", "server.mjs"),
  join(target, "mcp", "server.mjs"),
);
await mkdir(join(target, "dashboard"), { recursive: true });
await cp(
  join(root, "apps", "dashboard", "dist"),
  join(target, "dashboard", "dist"),
  { recursive: true },
);

const manifestPath = join(target, ".codex-plugin", "plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const cachebuster = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
manifest.version = `${rootPackage.version}+codex.${cachebuster}`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const requiredFiles = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "hooks/hooks.json",
  "hooks/user-prompt-submit.mjs",
  "hooks/stop.mjs",
  "skills/language-coach/SKILL.md",
  "mcp/server.mjs",
  "dashboard/dist/index.html",
];

for (const relativePath of requiredFiles) {
  await readFile(join(target, relativePath));
}

if (manifest.name !== "language-coach" || manifest.mcpServers !== "./.mcp.json") {
  throw new Error("The assembled plugin manifest is invalid.");
}

process.stdout.write(`Built ${target}\n`);
