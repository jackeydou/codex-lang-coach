import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"

import { AgentGlyph } from "@/landing/agent-glyph"
import { agents, type AgentKey } from "@/landing/demo-data"

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

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle")
  useEffect(() => {
    if (state === "idle") return
    const timer = window.setTimeout(() => setState("idle"), 2000)
    return () => window.clearTimeout(timer)
  }, [state])
  return (
    <button type="button" className="copy-button" data-state={state} aria-label={label}
      onClick={() => copyText(value).then(() => setState("copied"), () => setState("error"))}>
      {state === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      <span>{state === "copied" ? "Copied" : state === "error" ? "Try again" : "Copy"}</span>
    </button>
  )
}

export function InstallSection() {
  const id = useId()
  const [selected, setSelected] = useState<AgentKey>("claude")
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const index = agents.findIndex((agent) => agent.key === selected)
  const agent = agents[index] ?? agents[0]!

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = (index + delta + agents.length) % agents.length
    setSelected(agents[next]!.key)
    tabs.current[next]?.focus()
  }

  return (
    <div className="install">
      <div className="install-tabs" role="tablist" aria-label="Choose your coding agent">
        {agents.map((item, position) => (
          <button key={item.key} type="button" role="tab" id={`${id}-${item.key}`} aria-controls={`${id}-panel`}
            aria-selected={item.key === selected} tabIndex={item.key === selected ? 0 : -1} data-agent={item.key}
            ref={(element) => { tabs.current[position] = element }}
            onClick={() => setSelected(item.key)} onKeyDown={handleKey}>
            <AgentGlyph agent={item.key} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="install-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${agent.key}`} key={agent.key}>
        <section className="install-method install-method--prompt">
          <header>
            <span className="install-step">A</span>
            <div><h3>Ask your agent</h3><p>{agent.surface}. It reads the guide, installs the plugin and checks the setup.</p></div>
          </header>
          <div className="install-code install-code--prompt">
            <code>{agent.prompt}</code>
            <CopyButton value={agent.prompt} label={`Copy ${agent.label} install prompt`} />
          </div>
        </section>

        <section className="install-method">
          <header>
            <span className="install-step">B</span>
            <div><h3>Or install it yourself</h3><p>{agent.manual[0]}</p></div>
          </header>
          <div className="install-code install-code--shell">
            <code>{agent.commands.map((command) => <span key={command}><i aria-hidden="true">$</i>{command}</span>)}</code>
            <CopyButton value={agent.commands.join("\n")} label={`Copy ${agent.label} install commands`} />
          </div>
          <p className="install-footnote">{agent.manual[1]}</p>
        </section>
      </div>

      <ol className="install-after">
        <li><b>Start a new {agent.key === "codex" ? "task" : "session"}.</b> The coaching hook loads with it.</li>
        <li><b>Write as usual.</b> In English, or in your own language.</li>
        <li><b>Ask “open my Language Coach dashboard”.</b> Your agent hands you a local link.</li>
      </ol>
    </div>
  )
}
