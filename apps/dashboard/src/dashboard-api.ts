import type { DashboardData, DashboardRuntimeConfig, LanguageProfile, RemoteSyncConfig } from "@language-coach/core"

type ProfileUpdate = Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.")
    this.name = "UnauthorizedError"
  }
}

async function requestJson<T>(url: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error("The API could not be reached. Check your connection and site configuration.")
  }

  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Request failed with status ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export async function loadDashboardRuntime(
  options: { includeRemoteAuth?: boolean } = {},
): Promise<DashboardRuntimeConfig> {
  const current = await requestJson<DashboardRuntimeConfig>("/api/config")
  if (current.authUrl || !options.includeRemoteAuth) return current

  try {
    const remote = await requestJson<DashboardRuntimeConfig>(`${current.remoteUrl.replace(/\/$/, "")}/api/config`)
    return remote.authUrl ? { ...current, authUrl: remote.authUrl } : current
  } catch (error) {
    if (current.mode === "local") return current
    throw error
  }
}

export class DashboardApi {
  private localDeviceId?: string

  constructor(
    readonly runtime: DashboardRuntimeConfig,
    private readonly accessToken?: string,
  ) {}

  private runtimeToken(): string | undefined {
    return this.runtime.mode === "remote" ? this.accessToken : undefined
  }

  getDashboard(cursor?: string): Promise<DashboardData> {
    const params = new URLSearchParams({ limit: "50" })
    if (cursor) params.set("cursor", cursor)
    return requestJson<DashboardData>(`/api/dashboard?${params}`, {}, this.runtimeToken())
  }

  updateProfile(profile: ProfileUpdate): Promise<LanguageProfile> {
    return requestJson<LanguageProfile>(
      "/api/profile",
      { method: "PUT", body: JSON.stringify(profile) },
      this.runtimeToken(),
    )
  }

  deleteNote(id: string): Promise<{ deleted: boolean }> {
    return requestJson(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" }, this.runtimeToken())
  }

  async enableLocalSync(sessionToken: string): Promise<void> {
    this.assertLocalMode()
    const remoteUrl = this.runtime.remoteUrl.replace(/\/$/, "")
    const deviceId = crypto.randomUUID()
    const platform = typeof navigator === "undefined" ? "local device" : navigator.platform || "local device"
    const deviceName = `Language Coach on ${platform}`
    const created = await requestJson<{ token: string; userId: string; deviceId: string; deviceName: string }>(
      `${remoteUrl}/api/sync-tokens`,
      { method: "POST", body: JSON.stringify({ deviceId, deviceName }) },
      sessionToken,
    )
    if (created.deviceId !== deviceId) throw new Error("The remote service returned a different device identity.")
    this.localDeviceId = created.deviceId
    const config: RemoteSyncConfig = {
      remoteUrl,
      token: created.token,
      userId: created.userId,
      deviceId: created.deviceId,
      deviceName: created.deviceName,
    }
    await requestJson("/api/sync/configure", { method: "POST", body: JSON.stringify(config) })
  }

  async disableLocalSync(sessionToken: string): Promise<void> {
    this.assertLocalMode()
    const remoteUrl = this.runtime.remoteUrl.replace(/\/$/, "")
    const deviceId = this.localDeviceId || this.runtime.deviceId
    if (!deviceId) throw new Error("This device does not have a sync identity.")
    await requestJson(`${remoteUrl}/api/sync-tokens/${encodeURIComponent(deviceId)}`, { method: "DELETE" }, sessionToken)
    await requestJson("/api/sync/configure", { method: "DELETE" })
    this.localDeviceId = undefined
  }

  private assertLocalMode(): void {
    if (this.runtime.mode !== "local") {
      throw new Error("Sync settings can only be changed from the local dashboard.")
    }
  }
}

export function createDashboardApi(runtime: DashboardRuntimeConfig, accessToken?: string): DashboardApi {
  return new DashboardApi(runtime, accessToken)
}
