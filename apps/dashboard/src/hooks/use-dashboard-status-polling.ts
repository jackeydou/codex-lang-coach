import { useEffect, useRef } from "react"
import type { DashboardStatus } from "@language-coach/core"
import type { LearningDashboardClient } from "../dashboard-api"

export function useDashboardStatusPolling({
  client, embedded, syncing, onStatus, onError,
}: {
  client?: LearningDashboardClient
  embedded: boolean
  syncing: boolean
  onStatus: (status: DashboardStatus) => void
  onError: (error: unknown) => void
}) {
  const handlers = useRef({ onStatus, onError })
  handlers.current = { onStatus, onError }

  useEffect(() => {
    if (!client || (!embedded && !syncing)) return
    let cancelled = false
    let inFlight = false
    const poll = async () => {
      if (cancelled || inFlight || (embedded && document.visibilityState !== "visible")) return
      inFlight = true
      try {
        const status = await client.getDashboardStatus()
        if (!cancelled) handlers.current.onStatus(status)
      } catch (error) {
        if (!cancelled) handlers.current.onError(error)
      } finally {
        inFlight = false
      }
    }
    const refresh = () => { void poll() }
    const timer = window.setInterval(refresh, syncing ? 750 : 15_000)
    if (embedded) {
      window.addEventListener("focus", refresh)
      document.addEventListener("visibilitychange", refresh)
    }
    return () => {
      cancelled = true
      window.clearInterval(timer)
      if (embedded) {
        window.removeEventListener("focus", refresh)
        document.removeEventListener("visibilitychange", refresh)
      }
    }
  }, [client, embedded, syncing])
}
