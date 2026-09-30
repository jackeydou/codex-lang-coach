#!/usr/bin/env node
// Pin an installed plugin to the Node runtime running this repair command.
import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const argument = process.argv[2];
if (!argument) throw new Error("Usage: node scripts/repair-codex-runtime.mjs <installed-plugin-root>");
const root = resolve(argument);
const manifest = JSON.parse(await readFile(join(root, ".codex-plugin/plugin.json"), "utf8"));
if (manifest.name !== "language-coach") throw new Error("Expected an installed Language Coach plugin.");
execFileSync(process.execPath, ["--input-type=module", "-e", "import { DatabaseSync } from 'node:sqlite';"], { stdio: "pipe" });
const mcpPath = join(root, ".mcp.json");
const hookPath = join(root, "hooks/hooks.json");
const mcp = JSON.parse(await readFile(mcpPath, "utf8"));
const hooks = JSON.parse(await readFile(hookPath, "utf8"));
if (!mcp.mcpServers?.languageCoach) throw new Error("Language Coach MCP configuration is missing.");
await access(join(root, "mcp/server.mjs"));
mcp.mcpServers.languageCoach.command = process.execPath;
mcp.mcpServers.languageCoach.args = [join(root, "mcp/server.mjs")];
mcp.mcpServers.languageCoach.cwd = root;
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
for (const groups of Object.values(hooks.hooks)) {
  for (const group of groups) {
    for (const hook of group.hooks) {
      if (hook.type === "command" && /^node\s+/.test(hook.command)) {
        hook.command = hook.command.replace(/^node\s+/, `${shellQuote(process.execPath)} `);
      }
    }
  }
}
for (const [path, config] of [[mcpPath, mcp], [hookPath, hooks]]) {
  try { await copyFile(path, `${path}.before-runtime-repair`, 1); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}
console.log(`Repaired ${root} using ${process.execPath}. Reload the plugin in Codex to reconnect MCP.`);
