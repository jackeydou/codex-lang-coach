import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteLearningSync, SqliteLearningStore } from "@language-coach/core";
import { expect, it } from "vitest";
import { startDashboardServer } from "./dashboard-server.js";

it("opens the local dashboard directly and redirects root requests without affecting its API", async () => {
  const directory = mkdtempSync(join(tmpdir(), "language-coach-dashboard-"));
  const store = new SqliteLearningStore(join(directory, "test.sqlite"));
  const sync = new RemoteLearningSync(store, { LANGUAGE_COACH_SYNC_CONFIG_PATH: join(directory, "sync.json") });
  const { server, url } = await startDashboardServer(store, sync, 0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP server");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    expect(new URL(url).pathname).toBe("/dashboard");
    for (const method of ["GET", "HEAD"]) {
      const response = await fetch(`${origin}/?source=agent`, { method, redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/dashboard?source=agent");
    }
    expect(await (await fetch(`${origin}/api/config`)).json()).toMatchObject({ mode: "local" });
    expect(await (await fetch(`${origin}/api/dashboard`)).json()).toMatchObject({ sync: { enabled: false } });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
