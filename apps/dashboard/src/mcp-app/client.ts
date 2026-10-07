import type { App } from "@modelcontextprotocol/ext-apps"
import type { DashboardData, DashboardStatus, LanguageProfile, NotesOrder, MarkReviewedInput, MarkReviewedResult } from "@language-coach/core"
import type { LearningDashboardClient } from "../dashboard-api"

import { ReviewError } from "@language-coach/core/review"

type ToolBridge = Pick<App, "callServerTool" | "openLink">

export class McpDashboardClient implements LearningDashboardClient {
  constructor(private readonly bridge: ToolBridge) {}

  private async call(name: string, args: Record<string, unknown> = {}) {
    const result = await this.bridge.callServerTool({ name, arguments: args }, { timeout: 15_000 })
    if (result.isError) {
      const message = result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n")
      const data = result.structuredContent
      if (data?.code && ["INVALID_REQUEST", "NOT_FOUND", "VERSION_CONFLICT", "NOT_DUE", "SESSION_EXPIRED"].includes(String(data.code))) {
        throw new ReviewError(data.code as ReviewError["code"], message || `${name} failed.`, data.review as MarkReviewedResult["review"] | undefined)
      }
      throw new Error(message || `${name} failed.`)
    }
    if (!result.structuredContent) throw new Error(`${name} returned no structured data.`)
    return result.structuredContent
  }

  async getDashboard(cursor?: string, order?: NotesOrder): Promise<DashboardData> {
    const data = await this.call("get_learning_dashboard_data", { limit: 50, ...(cursor ? { cursor } : {}), ...(order ? { order } : {}) })
    if (!data.profile || !Array.isArray(data.notes) || !data.progress || !data.notesPage) {
      throw new Error("The dashboard returned an invalid snapshot.")
    }
    return data as unknown as DashboardData
  }

  async getDashboardStatus(): Promise<DashboardStatus> {
    const status = await this.call("get_learning_dashboard_status")
    if (!status.profile || !status.progress) throw new Error("The dashboard returned an invalid status.")
    return status as unknown as DashboardStatus
  }

  async updateProfile(profile: Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">): Promise<LanguageProfile> {
    const updated = await this.call("update_language_profile", profile)
    if (typeof updated.nativeLanguage !== "string" || typeof updated.targetLanguage !== "string" || typeof updated.coachEnabled !== "boolean") {
      throw new Error("The server returned an invalid language profile.")
    }
    return updated as unknown as LanguageProfile
  }

  async deleteNote(id: string): Promise<{ deleted: boolean }> {
    const result = await this.call("delete_learning_note", { id })
    if (typeof result.deleted !== "boolean") throw new Error("The server returned an invalid deletion result.")
    return { deleted: result.deleted }
  }

  async markReviewed(input: MarkReviewedInput): Promise<MarkReviewedResult> {
    const result = await this.call("mark_learning_note_reviewed", { ...input })
    const review = result.review as MarkReviewedResult["review"] | undefined
    if (result.id !== input.id || !review || !Number.isInteger(review.version) || typeof review.nextReviewAt !== "string") {
      throw new Error("The server returned an invalid review result.")
    }
    return result as unknown as MarkReviewedResult
  }

  async openStandalone(): Promise<void> {
    const { url } = await this.call("start_learning_dashboard")
    if (typeof url !== "string") throw new Error("The web dashboard returned no URL.")
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      throw new Error("The web dashboard returned an unexpected address.")
    }
    const result = await this.bridge.openLink({ url })
    if (result.isError) throw new Error("The host could not open the web dashboard.")
  }
}
