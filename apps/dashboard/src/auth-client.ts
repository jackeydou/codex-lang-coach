import type { DashboardRuntimeConfig } from "@language-coach/core"
import { createInternalNeonAuth, type VanillaBetterAuthClient } from "@neondatabase/neon-js/auth"

import { loadDashboardRuntime } from "@/dashboard-api"

export type AuthClient = {
  adapter: VanillaBetterAuthClient
  getJWTToken: () => Promise<string | null>
}

export type AuthUser = {
  id: string
  email: string
  name?: string
}

export type AuthSession = {
  token: string
  user: AuthUser
}

export async function initializeAuth(): Promise<{ runtime: DashboardRuntimeConfig; auth?: AuthClient }> {
  const runtime = await loadDashboardRuntime()
  return {
    runtime,
    auth: runtime.authUrl ? createInternalNeonAuth(runtime.authUrl) as AuthClient : undefined,
  }
}

export async function readAuthSession(auth: AuthClient): Promise<AuthSession | undefined> {
  const session = await auth.adapter.getSession()
  const token = await auth.getJWTToken()
  const user = session.data?.user
  if (!token || !user) return undefined
  return { token, user: { id: user.id, email: user.email, name: user.name } }
}
