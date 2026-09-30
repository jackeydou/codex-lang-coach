import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RemoteLearningSync, SqliteLearningStore } from "@language-coach/core";
import { afterEach, expect, it } from "vitest";
import { createLanguageCoachMcpServer, DASHBOARD_RESOURCE_URI } from "../src/index.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function fixture(withEmbeddedUi = true) {
  const directory = mkdtempSync(join(tmpdir(), "language-coach-mcp-"));
  const store = new SqliteLearningStore(join(directory, "test.sqlite"));
  const sync = new RemoteLearningSync(store, { LANGUAGE_COACH_SYNC_CONFIG_PATH: join(directory, "sync.json") });
  const server = createLanguageCoachMcpServer({
    store, remoteSync: sync,
    startDashboard: async () => ({ url: "http://127.0.0.1:43127", port: 43127 }),
    readDashboardHtml: withEmbeddedUi ? async () => "<!doctype html><title>Language Coach</title>" : undefined,
  });
  const client = new Client({ name: "dashboard-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  cleanup.push(async () => { await client.close(); await server.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { client, store };
}

it("discovers the UI entrypoint and reads the associated HTML resource", async () => {
  const { client } = await fixture();
  const { tools } = await client.listTools();
  expect(tools.find((tool) => tool.name === "open_learning_dashboard")?._meta).toMatchObject({
    ui: { resourceUri: DASHBOARD_RESOURCE_URI },
    "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
  });
  const { contents } = await client.readResource({ uri: DASHBOARD_RESOURCE_URI });
  expect(contents[0]).toMatchObject({ uri: DASHBOARD_RESOURCE_URI, mimeType: "text/html;profile=mcp-app", text: expect.stringContaining("Language Coach") });
  const opened = await client.callTool({ name: "open_learning_dashboard", arguments: {} });
  expect(opened.structuredContent).toMatchObject({ totalNotes: 0 });
  const fallback = await client.callTool({ name: "start_learning_dashboard", arguments: {} });
  expect(fallback.structuredContent).toMatchObject({ url: "http://127.0.0.1:43127" });
});

it("pages authoritative snapshots and reflects profile changes and note deletion", async () => {
  const { client, store } = await fixture();
  for (let index = 0; index < 3; index++) store.saveNote({
    turnId: `fixture-${index}`, inputLanguage: "target",
    originalExpression: `Fixture ${index}`, polishedExpression: `Polished fixture ${index}`,
    corrections: [], patterns: [], examples: [],
  });
  const first = (await client.callTool({ name: "get_learning_dashboard_data", arguments: { limit: 2 } })).structuredContent as { notes: { id: string }[]; notesPage: { nextCursor: string } };
  const second = (await client.callTool({ name: "get_learning_dashboard_data", arguments: { limit: 2, cursor: first.notesPage.nextCursor } })).structuredContent as { notes: { id: string }[] };
  expect(first.notes).toHaveLength(2);
  expect(second.notes).toHaveLength(1);
  expect(new Set([...first.notes, ...second.notes].map((note) => note.id)).size).toBe(3);
  await client.callTool({ name: "update_language_profile", arguments: { targetLanguage: "French" } });
  await client.callTool({ name: "delete_learning_note", arguments: { id: first.notes[0]!.id } });
  const updated = await client.callTool({ name: "get_learning_dashboard_data", arguments: {} });
  expect(updated.structuredContent).toMatchObject({ profile: { targetLanguage: "French" }, progress: { totalNotes: 2 }, sync: { enabled: false } });
  expect(JSON.stringify(updated.structuredContent)).not.toContain("token");
  expect((await client.callTool({ name: "get_learning_dashboard_data", arguments: { limit: 101 } })).isError).toBe(true);
});

it("omits embedded UI for packages without HTML while preserving the web dashboard", async () => {
  const { client } = await fixture(false);
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).not.toContain("open_learning_dashboard");
  expect(tools.map((tool) => tool.name)).not.toContain("get_learning_dashboard_data");
  expect(client.getServerCapabilities()?.resources).toBeUndefined();
  const fallback = await client.callTool({ name: "start_learning_dashboard", arguments: {} });
  expect(fallback.structuredContent).toMatchObject({ url: "http://127.0.0.1:43127" });
});
