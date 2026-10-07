#!/usr/bin/env node
// Local desktop installs cannot rely on the shell's Node/PATH configuration.
import { execFileSync } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const catalog = JSON.parse(execFileSync("codex", ["plugin", "marketplace", "list", "--json"], { encoding: "utf8" }));
const marketplace = catalog.marketplaces.find((item) => item.name === "language-coach");
if (!marketplace) throw new Error("The language-coach local marketplace must be registered first.");
const target = join(marketplace.root, "plugins", "language-coach");
await cp(resolve("dist/language-coach"), target, { recursive: true });
for (const file of [".mcp.json"]) {
  const path = join(target, file);
  const config = JSON.parse(await readFile(path, "utf8"));
  config.mcpServers.languageCoach.command = process.execPath;
  config.mcpServers.languageCoach.args = [join(target, "mcp", "server.mjs")];
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}
const hookPath = join(target, "hooks", "hooks.json");
const hooks = JSON.parse(await readFile(hookPath, "utf8"));
for (const groups of Object.values(hooks.hooks)) {
  for (const group of groups) {
    for (const hook of group.hooks) {
      if (hook.type === "command") hook.command = hook.command.replace(/^node\s+/, `${JSON.stringify(process.execPath)} `);
    }
  }
}
await writeFile(hookPath, `${JSON.stringify(hooks, null, 2)}\n`);
// Keep the compatibility manifest explicit for hosts that inspect the overlay.
const overlayPath = join(target, ".codex-plugin", "plugin.json");
const overlay = JSON.parse(await readFile(overlayPath, "utf8"));
overlay.hooks = "./hooks/hooks.json";
await writeFile(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
process.stdout.write(execFileSync("codex", ["plugin", "add", "language-coach@language-coach", "--json"], { encoding: "utf8" }));
