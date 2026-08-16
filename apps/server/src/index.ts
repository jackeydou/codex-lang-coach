#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SqliteLearningStore } from "@language-coach/core";
import { createLanguageCoachMcpServer } from "@language-coach/mcp";
import { startDashboardServer } from "./dashboard-server.js";

const store = new SqliteLearningStore();
let dashboard: Awaited<ReturnType<typeof startDashboardServer>> | undefined;

async function ensureDashboard() {
  dashboard ??= await startDashboardServer(store);
  return dashboard;
}

async function shutdown(): Promise<void> {
  if (dashboard) {
    await new Promise<void>((resolve, reject) => {
      dashboard?.server.close((error) => error ? reject(error) : resolve());
    });
  }
  store.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

if (process.argv.includes("--dashboard")) {
  const runningDashboard = await ensureDashboard();
  process.stderr.write(`Language Coach dashboard is running at ${runningDashboard.url}\n`);
} else {
  const server = createLanguageCoachMcpServer({ store, startDashboard: ensureDashboard });
  await server.connect(new StdioServerTransport());
}
