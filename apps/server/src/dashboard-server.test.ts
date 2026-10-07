import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteLearningSync, SqliteLearningStore } from "@language-coach/core";
import { expect, it, vi } from "vitest";
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

it("records reviews through HTTP with typed errors and shared review pagination", async () => {
  const directory = mkdtempSync(join(tmpdir(), "language-coach-http-review-"));
  const store = new SqliteLearningStore(join(directory, "test.sqlite"));
  const sync = new RemoteLearningSync(store, { LANGUAGE_COACH_SYNC_CONFIG_PATH: join(directory, "sync.json") });
  const { server } = await startDashboardServer(store, sync, 0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const note = store.saveNote({ inputLanguage: "target", originalExpression: "HTTP review", polishedExpression: "HTTP review", corrections: [], patterns: [], examples: [] });
    const body = { requestId: crypto.randomUUID(), expectedVersion: 0 };
    const post = (input: unknown, id = note.id) => fetch(`${origin}/api/notes/${id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const first = await post(body);
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result).toMatchObject({ id: note.id, review: { stage: 1, reviewCount: 1 } });
    expect(await (await post(body)).json()).toEqual(result);
    const stale = await post({ ...body, requestId: crypto.randomUUID() });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "VERSION_CONFLICT", review: { version: 1 } });
    const early = await post({ requestId: crypto.randomUUID(), expectedVersion: 1 });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: "NOT_DUE" });
    expect((await post({})).status).toBe(400);
    expect((await post({ ...body, requestId: crypto.randomUUID() }, "missing")).status).toBe(404);
    const dashboard = await (await fetch(`${origin}/api/dashboard?order=review`)).json();
    expect(dashboard).toMatchObject({ capabilities: { reviewScheduling: true }, reviewSummary: { new: 0, scheduled: 1 } });
    expect(dashboard.notes[0].review).toEqual(result.review);
    const readDeck = vi.spyOn(store, "getDashboardData");
    store.updateProfile({ targetLanguage: "French" });
    const status = await (await fetch(`${origin}/api/dashboard/status`)).json();
    expect(status).toMatchObject({ profile: { targetLanguage: "French" }, progress: { totalNotes: 1 }, sync: { enabled: false } });
    expect(Object.keys(status)).toEqual(["profile", "progress", "sync"]);
    expect(readDeck).not.toHaveBeenCalled();
    readDeck.mockRestore();
    const malformedCursor = await fetch(`${origin}/api/dashboard?order=review&cursor=invalid`);
    expect(malformedCursor.status).toBe(400);
    expect(await malformedCursor.json()).toMatchObject({ code: "INVALID_REQUEST" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
