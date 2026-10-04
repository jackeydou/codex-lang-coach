#!/usr/bin/env node
// Exercise the installed plugin through Codex's actual app-server protocol.
// All writes go to a disposable database, and no model turn is started.
import { spawn, execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";

// Review-only mode validates the compiled dashboard without requiring installed development hooks.
const reviewOnly = process.argv.includes("--review-only");
const directory = await mkdtemp(join(tmpdir(), "language-coach-codex-ui-"));
await cp(resolve("dist/language-coach"), join(directory, "plugin"), { recursive: true });
const marketplace = JSON.parse(execFileSync("codex", ["plugin", "marketplace", "list", "--json"], { encoding: "utf8" })).marketplaces.find((item) => item.name === "language-coach-dev-local");
assert(marketplace, "Install the Language Coach marketplace before running this test.");
const serverName = "languageCoachUiTest";
const processHandle = spawn("codex", [
  "-c", 'plugins."language-coach@language-coach".enabled=false',
  "-c", `mcp_servers.${serverName}.command=${JSON.stringify(process.execPath)}`,
  "-c", `mcp_servers.${serverName}.args=[${JSON.stringify(join(directory, "plugin/mcp/server.mjs"))}]`,
  "-c", `mcp_servers.${serverName}.env={ LANGUAGE_COACH_DB_PATH = ${JSON.stringify(join(directory, "test.sqlite"))}, LANGUAGE_COACH_SYNC_CONFIG_PATH = ${JSON.stringify(join(directory, "sync.json"))} }`,
  "app-server", "--stdio",
], {
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});
let nextId = 0;
const pending = new Map();
const input = createInterface({ input: processHandle.stdout });
input.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
processHandle.stderr.on("data", () => {});
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, 45_000);
    pending.set(id, { resolve, reject, timer });
    processHandle.stdin.write(`${JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) })}\n`);
  });
}

try {
  await request("initialize", { clientInfo: { name: "language-coach-ui-test", title: "Language Coach UI test", version: "1" }, capabilities: { experimentalApi: true, requestAttestation: false } });
  processHandle.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
  const { plugin } = await request("plugin/read", { marketplacePath: join(marketplace.root, ".agents/plugins/marketplace.json"), pluginName: "language-coach-dev" });
  console.log(JSON.stringify({ stage: "plugin", mcpServers: plugin.mcpServers, skills: plugin.skills.map((skill) => skill.name) }));
  const hookInventory = await request("hooks/list", { cwd: resolve(".") });
  const devHooks = hookInventory.data.flatMap((entry) => entry.hooks).filter((hook) => hook.pluginId === "language-coach-dev@language-coach-dev-local");
  if (!reviewOnly) assert(devHooks.some((hook) => hook.eventName === "userPromptSubmit" || hook.event === "userPromptSubmit"), "Development prompt hook is missing.");
  if (!reviewOnly) assert(!devHooks.some((hook) => hook.eventName === "stop" || hook.event === "stop"), "Stop hook must not be registered.");
  console.log(JSON.stringify({ stage: "hooks", hooks: devHooks.map(({ eventName, event, enabled }) => ({ eventName, event, enabled })) }));
  const { thread } = await request("thread/start", { cwd: resolve("."), ephemeral: true, approvalPolicy: "never", sandbox: "read-only" });
  const status = await request("mcpServerStatus/list", { threadId: thread.id, serverName, detail: "full", limit: 100 });
  console.log(JSON.stringify({stage: "icon", info: status.data.map(s => ({keys:Object.keys(s), icons:s.serverInfo?.icons?.map(i=>({mimeType:i.mimeType,length:i.src.length}))}))}));
  console.log(JSON.stringify({ stage: "inventory", servers: status.data.map(({ name, pluginId, runtimeStatus, toolsError }) => ({ name, pluginId, runtimeStatus, toolsError })) }));
  const server = status.data.find((entry) => entry.name === serverName);
  assert(server, "Codex did not discover the installed plugin MCP server.");
  const tool = Object.values(server.tools).find((tool) => tool.name === "open_learning_dashboard");
  assert(tool, "Codex did not discover the UI tool.");
  assert.equal(tool._meta.ui.resourceUri, "ui://language-coach/dashboard/v1.html");
  const opened = await request("mcpServer/tool/call", { threadId: thread.id, server: server.name, tool: "open_learning_dashboard", arguments: {} });
  assert(!opened.isError);
  const resource = await request("mcpServer/resource/read", { threadId: thread.id, server: server.name, uri: tool._meta.ui.resourceUri });
  console.log(JSON.stringify({ stage: "resource", keys: Object.keys(resource) }));
  const call = (tool, args = {}) => request("mcpServer/tool/call", { threadId: thread.id, server: server.name, tool, arguments: args });
  const baseline = await call("get_learning_dashboard_data");
  assert.equal(baseline.structuredContent.progress.totalNotes, 0, "Refusing writes: test database is not empty.");
  assert.equal(baseline.structuredContent.sync.enabled, false, "Refusing writes: cloud sync is enabled.");
  const saved = await call("save_learning_note", { turnId: "disposable-codex-ui-test", inputLanguage: "target", originalExpression: "How I can test this?", polishedExpression: "How can I test this?", corrections: [], patterns: [], examples: [] });
  assert(!saved.isError);
  const updated = await call("update_language_profile", { targetLanguage: "French" });
  assert(!updated.isError);
  const snapshot = await call("get_learning_dashboard_data");
  assert.equal(snapshot.structuredContent.profile.targetLanguage, "French");
  assert.equal(snapshot.structuredContent.notes.length, 1);
  assert.equal(snapshot.structuredContent.capabilities.reviewScheduling, true);
  const reviewArgs = { id: saved.structuredContent.id, requestId: crypto.randomUUID(), expectedVersion: 0 };
  const reviewed = await call("mark_learning_note_reviewed", reviewArgs);
  assert(!reviewed.isError);
  assert.equal(reviewed.structuredContent.review.stage, 1);
  const retried = await call("mark_learning_note_reviewed", reviewArgs);
  assert.deepEqual(retried.structuredContent, reviewed.structuredContent);
  const reviewSnapshot = await call("get_learning_dashboard_data", { order: "review" });
  assert.equal(reviewSnapshot.structuredContent.notes[0].review.reviewCount, 1);
  assert.equal(reviewSnapshot.structuredContent.reviewSummary.scheduled, 1);
  const deleted = await call("delete_learning_note", { id: saved.structuredContent.id });
  assert.equal(deleted.structuredContent.deleted, true);
  const empty = await call("get_learning_dashboard_data");
  assert.equal(empty.structuredContent.notes.length, 0);
  const builtManifest = JSON.parse(await readFile(join(directory, "plugin/.codex-plugin/plugin.json"), "utf8"));
  const report = { codexVersion: execFileSync("codex", ["--version"], { encoding: "utf8" }).trim(), pluginVersion: builtManifest.version, installedDevelopmentPluginVersion: plugin.summary.localVersion, server: server.name, toolMetadata: tool._meta, resourceLoaded: true, settingsUpdated: true, noteSavedAndDeleted: true, isolatedDatabase: true, reviewRecordedAndDeduplicated: true, developmentHooksVerified: !reviewOnly, nativeRendering: "Not verified by this protocol test" };
  await writeFile(resolve("dist/codex-ui-test.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--serve")) {
    await call("update_language_profile", { targetLanguage: "English" });
    await call("save_learning_note", { turnId: "disposable-browser-test", inputLanguage: "target", originalExpression: "How I can test this?", polishedExpression: "How can I test this?", corrections: [{ original: "How I can", replacement: "How can I", category: "structure", reason: "Put the modal before the subject in a question." }], patterns: [{ pattern: "How can I …?", explanation: "Ask how to do something." }], examples: [{ context: "work", text: "How can I test this integration?" }] });
    const bundle = await build({
      stdin: { contents: `
        import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
        const iframe = document.querySelector("iframe");
        const bridge = new AppBridge(null, { name: "Language Coach test harness", version: "1" }, { serverTools: {}, openLinks: {} }, { hostContext: { theme: "light", displayMode: "fullscreen" } });
        bridge.oncalltool = async ({ name, arguments: args }) => {
          const response = await fetch("/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, arguments: args }) });
          if (!response.ok) throw new Error("Test server rejected the call.");
          return response.json();
        };
        bridge.onopenlink = async () => ({ isError: true });
        bridge.oninitialized = () => {
          document.getElementById("status").textContent = "Connected to Codex app-server · disposable test data";
          bridge.sendToolInput({ arguments: {} });
          bridge.sendToolResult({ content: [] });
        };
        document.getElementById("theme").onclick = () => {
          const dark = document.body.dataset.dark !== "true";
          document.body.dataset.dark = String(dark);
          bridge.setHostContext({ theme: dark ? "dark" : "light", displayMode: "fullscreen" });
        };
        document.getElementById("width").onclick = () => { iframe.style.width = iframe.style.width === "420px" ? "100%" : "420px"; };
        await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
        iframe.src = "/app.html";
      `, resolveDir: resolve("apps/dashboard"), sourcefile: "test-host.ts" },
      bundle: true, write: false, format: "esm", platform: "browser",
    });
    const audit = [];
    const allowed = new Set(["get_learning_dashboard_data", "update_language_profile", "delete_learning_note", "mark_learning_note_reviewed"]);
    const http = createServer(async (req, res) => {
      try {
        if (req.url === "/host.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle.outputFiles[0].text); return; }
        if (req.url === "/app.html") { res.setHeader("content-type", "text/html"); res.end(resource.contents[0].text); return; }
        if (req.url === "/audit") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(audit)); return; }
        if (req.url === "/call" && req.method === "POST") {
          if (req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403).end(); return; }
          let body = "";
          for await (const chunk of req) { body += chunk; if (body.length > 32768) throw new Error("Request too large"); }
          const input = JSON.parse(body);
          if (!allowed.has(input.name)) { res.writeHead(403).end(); return; }
          const result = await call(input.name, input.arguments || {});
          audit.push({ tool: input.name, isError: Boolean(result.isError), ...(input.name === "get_learning_dashboard_data" ? { totalNotes: result.structuredContent?.progress?.totalNotes, targetLanguage: result.structuredContent?.profile?.targetLanguage } : {}) });
          res.setHeader("content-type", "application/json"); res.end(JSON.stringify(result)); return;
        }
        res.setHeader("content-type", "text/html");
        res.end('<!doctype html><title>Language Coach MCP Apps test</title><style>body{margin:0;font:13px system-ui;background:#eee}header{height:40px;display:flex;align-items:center;gap:12px;padding:0 16px}iframe{display:block;border:0;width:100%;height:calc(100vh - 40px);margin:auto}</style><header><strong>MCP Apps bridge test</strong><span id="status">Connecting…</span><button id="theme">Toggle theme</button><button id="width">Toggle panel width</button></header><iframe title="Language Coach dashboard" sandbox="allow-scripts allow-same-origin allow-forms"></iframe><script type="module" src="/host.js"></script>');
      } catch (error) { res.writeHead(500).end(JSON.stringify({ error: error.message })); }
    });
    await new Promise((resolve) => http.listen(43129, "127.0.0.1", resolve));
    console.log("Browser harness: http://127.0.0.1:43129 (not the native Codex renderer)");
    await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
    await new Promise((resolve) => http.close(resolve));
  }
} finally {
  input.close();
  processHandle.kill("SIGTERM");
  for (const { timer, reject } of pending.values()) { clearTimeout(timer); reject(new Error("Test ended.")); }
  await rm(directory, { recursive: true, force: true });
}
