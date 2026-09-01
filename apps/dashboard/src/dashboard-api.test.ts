import type { DashboardData, DashboardRuntimeConfig } from "@language-coach/core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createDashboardApi, loadDashboardRuntime, UnauthorizedError } from "@/dashboard-api"

const dashboard: DashboardData = {
  profile: {
    nativeLanguage: "Chinese",
    targetLanguage: "English",
    coachEnabled: true,
    updatedAt: "2026-08-31T00:00:00.000Z",
  },
  notes: [],
  progress: {
    totalNotes: 0,
    notesThisWeek: 0,
    activeDays: 0,
    currentStreak: 0,
    weeklyActivity: [],
    categoryCounts: [],
    recurringPatterns: [],
    languageUse: { native: 0, target: 0, mixed: 0, other: 0, targetShare: 0 },
  },
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("loadDashboardRuntime", () => {
  it("keeps local mode while loading auth configuration from the remote site", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ mode: "local", remoteUrl: "https://remote.example" }))
      .mockResolvedValueOnce(json({ mode: "remote", remoteUrl: "https://remote.example", authUrl: "https://auth.example" }))

    await expect(loadDashboardRuntime()).resolves.toEqual({
      mode: "local",
      remoteUrl: "https://remote.example",
      authUrl: "https://auth.example",
    })
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/config", expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://remote.example/api/config", expect.any(Object))
  })

  it("keeps the local dashboard available when the remote site is offline", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ mode: "local", remoteUrl: "https://remote.example" }))
      .mockRejectedValueOnce(new TypeError("Network error"))

    await expect(loadDashboardRuntime()).resolves.toEqual({
      mode: "local",
      remoteUrl: "https://remote.example",
    })
  })
})

describe("DashboardApi", () => {
  it("uses the same-origin local API without a bearer token", async () => {
    const runtime: DashboardRuntimeConfig = { mode: "local", remoteUrl: "https://remote.example" }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(dashboard))

    await expect(createDashboardApi(runtime, "unused-token").getDashboard()).resolves.toEqual(dashboard)
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard?limit=50", expect.objectContaining({
      headers: expect.not.objectContaining({ authorization: expect.anything() }),
    }))
  })

  it("adds the session bearer token to remote API requests", async () => {
    const runtime: DashboardRuntimeConfig = { mode: "remote", remoteUrl: "https://remote.example" }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(dashboard))

    await createDashboardApi(runtime, "session-jwt").getDashboard()
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard?limit=50", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer session-jwt" }),
    }))
  })

  it("creates a remote device token before enabling sync on the local API", async () => {
    const runtime: DashboardRuntimeConfig = { mode: "local", remoteUrl: "https://remote.example/" }
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (_url, options) => {
        const input = JSON.parse(String(options?.body)) as { deviceId: string; deviceName: string }
        return json({ token: "device-token", userId: "user-1", ...input })
      })
      .mockResolvedValueOnce(json({ enabled: true }))

    await createDashboardApi(runtime).enableLocalSync("session-jwt")

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://remote.example/api/sync-tokens", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer session-jwt" }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/sync/configure", expect.objectContaining({
      body: expect.stringContaining('"deviceId"'),
    }))
    const tokenRequest = fetchMock.mock.calls[0]?.[1]
    const tokenInput = JSON.parse(String(tokenRequest?.body)) as { deviceId: string; deviceName: string }
    expect(tokenInput.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    const configureRequest = fetchMock.mock.calls[1]?.[1]
    expect(JSON.parse(String(configureRequest?.body))).toEqual({
      remoteUrl: "https://remote.example",
      token: "device-token",
      userId: "user-1",
      ...tokenInput,
    })
  })

  it("passes the next-page cursor to the dashboard endpoint", async () => {
    const runtime: DashboardRuntimeConfig = { mode: "remote", remoteUrl: "https://remote.example" }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(dashboard))

    await createDashboardApi(runtime, "session-jwt").getDashboard("next page")

    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard?limit=50&cursor=next+page", expect.any(Object))
  })

  it("normalizes unauthorized responses", async () => {
    const runtime: DashboardRuntimeConfig = { mode: "remote", remoteUrl: "https://remote.example" }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "Authentication required." }, 401))

    await expect(createDashboardApi(runtime).getDashboard()).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
