import { describe, expect, it, vi } from "vitest"
import { McpDashboardClient } from "./client"

function fixture(result: Record<string, unknown>) {
  const bridge = {
    callServerTool: vi.fn().mockResolvedValue({ content: [], ...result }),
    openLink: vi.fn().mockResolvedValue({}),
  }
  return { bridge, client: new McpDashboardClient(bridge) }
}

describe("McpDashboardClient", () => {
  it("pages through the bridge without using HTTP", async () => {
    const data = { profile: {}, notes: [], progress: {}, notesPage: { hasMore: false } }
    const { bridge, client } = fixture({ structuredContent: data })
    expect(await client.getDashboard("next-page")).toEqual(data)
    expect(bridge.callServerTool).toHaveBeenCalledWith({ name: "get_learning_dashboard_data", arguments: { limit: 50, cursor: "next-page" } }, { timeout: 15_000 })
  })

  it("surfaces tool failures and refuses malformed snapshots", async () => {
    const failed = fixture({ isError: true, content: [{ type: "text", text: "Host denied the call." }] })
    await expect(failed.client.deleteNote("fixture")).rejects.toThrow("Host denied the call.")
    const malformed = fixture({ structuredContent: { notes: [] } })
    await expect(malformed.client.getDashboard()).rejects.toThrow("invalid snapshot")
  })

  it("only opens the local dashboard address supplied by its server", async () => {
    const local = fixture({ structuredContent: { url: "http://127.0.0.1:43127" } })
    await local.client.openStandalone()
    expect(local.bridge.openLink).toHaveBeenCalledWith({ url: "http://127.0.0.1:43127" })
    const external = fixture({ structuredContent: { url: "https://example.com" } })
    await expect(external.client.openStandalone()).rejects.toThrow("unexpected address")
    expect(external.bridge.openLink).not.toHaveBeenCalled()
  })
})

it("submits review actions through the bridge and retains typed error state", async () => {
  const { ReviewError } = await import("@language-coach/core/review")
  const input = { id: "fixture", requestId: crypto.randomUUID(), expectedVersion: 0 }
  const review = { version: 1, nextReviewAt: "2026-10-04T12:00:00.000Z" }
  const { bridge, client } = fixture({ structuredContent: { id: input.id, review } })
  expect(await client.markReviewed(input)).toMatchObject({ review })
  expect(bridge.callServerTool).toHaveBeenCalledWith({ name: "mark_learning_note_reviewed", arguments: input }, { timeout: 15_000 })
  const failed = fixture({ isError: true, structuredContent: { code: "VERSION_CONFLICT", review }, content: [{ type: "text", text: "Updated elsewhere." }] })
  await expect(failed.client.markReviewed(input)).rejects.toMatchObject({ code: "VERSION_CONFLICT", review })
  await expect(failed.client.markReviewed(input)).rejects.toBeInstanceOf(ReviewError)
})

it("polls status through the status tool without deck options and rejects malformed responses", async () => {
  const status = { profile: {}, progress: {}, sync: { enabled: false } }
  const { client, bridge } = fixture({ structuredContent: status })
  expect(await client.getDashboardStatus()).toEqual(status)
  expect(bridge.callServerTool).toHaveBeenCalledWith({ name: "get_learning_dashboard_status", arguments: {} }, { timeout: 15_000 })
  const malformed = fixture({ structuredContent: { profile: {} } })
  await expect(malformed.client.getDashboardStatus()).rejects.toThrow("invalid status")
})
