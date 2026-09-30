#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve("dist/language-coach-dev-marketplace");
const plugin = join(root, "plugins/language-coach-dev");
await rm(plugin, { recursive: true, force: true });
await cp(resolve("dist/language-coach"), plugin, { recursive: true });
const data = resolve(".dev/language-coach");
await mkdir(data, { recursive: true, mode: 0o700 });
const env = {
  LANGUAGE_COACH_DEV_ISOLATED: "1",
  LANGUAGE_COACH_DB_PATH: join(data, "learning.sqlite"),
  LANGUAGE_COACH_SYNC_CONFIG_PATH: join(data, "remote-sync.json"),
  LANGUAGE_COACH_PORT: "43128",
  LANGUAGE_COACH_REMOTE_URL: "http://127.0.0.1:43128",
};
for (const file of [".codex-plugin/plugin.json"]) {
  const path = join(plugin, file);
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.name = "language-coach-dev";
  const extension = manifest.extensions?.["com.openai"] ?? manifest;
  extension.interface.displayName = "Language Coach Dev";
  extension.hooks = "./hooks/hooks.json";
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
}
for (const file of [".mcp.json"]) {
  const path = join(plugin, file);
  const config = JSON.parse(await readFile(path, "utf8"));
  const original = config.mcpServers.languageCoach;
  config.mcpServers = { languageCoachDev: { ...original, command: process.execPath, args: [join(plugin, "mcp/server.mjs")], env } };
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
}
const hooksPath = join(plugin, "hooks/hooks.json");
const hooks = JSON.parse(await readFile(hooksPath, "utf8"));
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
for (const groups of Object.values(hooks.hooks)) for (const group of groups) for (const hook of group.hooks) {
  if (!hook.command.includes("user-prompt-submit")) throw new Error("Unsupported development hook: " + hook.command);
  const script = "user-prompt-submit.mjs";
  hook.command = `/usr/bin/env ${Object.entries(env).map(([key, value]) => `${key}=${quote(value)}`).join(" ")} ${quote(process.execPath)} ${quote(join(plugin, "hooks", script))}`;
}
await writeFile(hooksPath, JSON.stringify(hooks, null, 2) + "\n");
const skillPath = join(plugin, "skills/language-coach/SKILL.md");
await writeFile(skillPath, (await readFile(skillPath, "utf8")).replace("name: language-coach", "name: language-coach-dev"));
await mkdir(join(root, ".agents/plugins"), { recursive: true });
await writeFile(join(root, ".agents/plugins/marketplace.json"), JSON.stringify({
  name: "language-coach-dev-local", interface: { displayName: "Language Coach local development" },
  plugins: [{ name: "language-coach-dev", source: { source: "local", path: "./plugins/language-coach-dev" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" } }],
}, null, 2) + "\n");
console.log(root);
