import type { AgentKey } from "@/landing/demo-data"

export function AgentGlyph({ agent }: { agent: AgentKey }) {
  if (agent === "claude") {
    return (
      <svg className="agent-glyph" viewBox="0 0 24 24" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => <rect key={index} x="11" y="2.5" width="2" height="8" rx="1" transform={`rotate(${index * 45} 12 12)`} />)}
      </svg>
    )
  }
  if (agent === "codex") {
    return (
      <svg className="agent-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13.5 6.5l-3 11" />
      </svg>
    )
  }
  return (
    <svg className="agent-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 12 20.5 7.25M12 12v9.5M12 12 3.5 7.25" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
    </svg>
  )
}
