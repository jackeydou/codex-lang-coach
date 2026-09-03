import { CheckIcon, ChevronDownIcon, CopyIcon, SparklesIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"

type AgentKey = "codex" | "claude" | "cursor"

type AgentOption = {
  key: AgentKey
  label: string
  instruction: string
  prompt: string
}

const agents: AgentOption[] = [
  {
    key: "codex",
    label: "Codex",
    instruction: "Paste this into any task in the Codex desktop app.",
    prompt: "/goal Read https://language-coach.pluginsfoundry.dev/codex and install the Language Coach plugin for me. When setup is complete, start a new task so the plugin is active.",
  },
  {
    key: "claude",
    label: "Claude Code",
    instruction: "Paste this into a Claude Code session.",
    prompt: "Read https://language-coach.pluginsfoundry.dev/claude and install the Language Coach plugin for me. When setup is complete, tell me to start a new session.",
  },
  {
    key: "cursor",
    label: "Cursor",
    instruction: "Paste this into the Cursor agent for your workspace.",
    prompt: "Read https://language-coach.pluginsfoundry.dev/cursor and install the Language Coach plugin for this workspace.",
  },
]

type CopyState = "idle" | "copied" | "error"

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textArea = document.createElement("textarea")
  textArea.value = value
  textArea.style.position = "fixed"
  textArea.style.opacity = "0"
  document.body.append(textArea)
  textArea.select()
  const copied = document.execCommand("copy")
  textArea.remove()
  if (!copied) throw new Error("Copy command was unavailable")
}

export function AgentInstallPanel() {
  const panelId = useId()
  const [expanded, setExpanded] = useState(false)
  const [selectedKey, setSelectedKey] = useState<AgentKey>("codex")
  const [copyState, setCopyState] = useState<CopyState>("idle")
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = agents.findIndex(({ key }) => key === selectedKey)
  const selectedAgent = agents[selectedIndex] ?? agents[0]!

  useEffect(() => {
    if (copyState === "idle") return
    const timer = window.setTimeout(() => setCopyState("idle"), 2200)
    return () => window.clearTimeout(timer)
  }, [copyState])

  const selectTab = (index: number) => {
    const agent = agents[index]
    if (!agent) return
    setSelectedKey(agent.key)
    setCopyState("idle")
    tabRefs.current[index]?.focus()
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex = selectedIndex
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (selectedIndex + 1) % agents.length
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (selectedIndex - 1 + agents.length) % agents.length
    else if (event.key === "Home") nextIndex = 0
    else if (event.key === "End") nextIndex = agents.length - 1
    else return

    event.preventDefault()
    selectTab(nextIndex)
  }

  const handleCopy = async () => {
    try {
      await copyText(selectedAgent.prompt)
      setCopyState("copied")
    } catch {
      setCopyState("error")
    }
  }

  return (
    <div className="agent-install">
      <button
        type="button"
        className="agent-install-trigger"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
      >
        <SparklesIcon aria-hidden="true" />
        <span>Use with your coding agent</span>
        <ChevronDownIcon className="agent-install-chevron" aria-hidden="true" />
      </button>

      <div className="agent-install-reveal" data-open={expanded} aria-hidden={!expanded}>
        <div className="agent-install-reveal-inner">
          <section className="agent-install-panel" id={panelId} aria-label="Install Language Coach with a coding agent" inert={!expanded}>
            <div className="agent-install-tabs" role="tablist" aria-label="Choose a coding agent">
              {agents.map((agent, index) => {
                const selected = agent.key === selectedKey
                return (
                  <button
                    type="button"
                    role="tab"
                    id={`${panelId}-${agent.key}-tab`}
                    aria-controls={`${panelId}-${agent.key}-panel`}
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    className="agent-install-tab"
                    key={agent.key}
                    ref={(element) => { tabRefs.current[index] = element }}
                    onClick={() => selectTab(index)}
                    onKeyDown={handleTabKeyDown}
                  >
                    {agent.label}
                  </button>
                )
              })}
            </div>

            <div
              className="agent-install-content"
              role="tabpanel"
              id={`${panelId}-${selectedAgent.key}-panel`}
              aria-labelledby={`${panelId}-${selectedAgent.key}-tab`}
              key={selectedAgent.key}
            >
              <p>{selectedAgent.instruction}</p>
              <div className="agent-install-command">
                <code>{selectedAgent.prompt}</code>
                <button
                  type="button"
                  className="agent-install-copy"
                  aria-label={`Copy ${selectedAgent.label} installation prompt`}
                  onClick={handleCopy}
                >
                  {copyState === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                  <span>{copyState === "copied" ? "Copied" : copyState === "error" ? "Try again" : "Copy prompt"}</span>
                </button>
              </div>
              <span className="agent-install-note">The agent will read the guide, install the plugin, and verify the setup.</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
