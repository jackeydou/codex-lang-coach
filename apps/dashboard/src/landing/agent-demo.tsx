import { ArrowUpIcon, CheckIcon, CornerDownLeftIcon, FileCode2Icon, RotateCcwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { Marked } from "@/components/diff-text"
import { diffWords, isComparable } from "@/lib/word-diff"
import { agents, scenarios, type AgentKey, type DemoNote, type DemoScenario } from "@/landing/demo-data"
import { AgentGlyph } from "@/landing/agent-glyph"
import { DemoLibrary, useDemoLibrary } from "@/landing/demo-library"

type Step =
  | { kind: "thinking" }
  | { kind: "version" }
  | { kind: "polished" }
  | { kind: "correction"; index: number }
  | { kind: "patterns" }
  | { kind: "verdict" }
  | { kind: "tool" }
  | { kind: "rule" }
  | { kind: "task"; index: number }

function timelineFor(scenario: DemoScenario): Step[] {
  const steps: Step[] = [{ kind: "thinking" }]
  if (scenario.note) {
    steps.push({ kind: "version" }, { kind: "polished" })
    scenario.note.corrections.forEach((_, index) => steps.push({ kind: "correction", index }))
    steps.push({ kind: "patterns" }, { kind: "tool" })
  } else {
    steps.push({ kind: "verdict" })
  }
  steps.push({ kind: "rule" })
  scenario.task.forEach((_, index) => steps.push({ kind: "task", index }))
  return steps
}

const STEP_DELAY: Record<Step["kind"], number> = {
  thinking: 900, version: 380, polished: 520, correction: 420, patterns: 560, verdict: 600, tool: 1100, rule: 300, task: 520,
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return reduced
}

function noteDiff(note: DemoNote) {
  if (note.inputLanguage !== "target" || !isComparable(note.originalExpression, note.polishedExpression)) return undefined
  return diffWords(note.originalExpression, note.polishedExpression)
}

const contextLabel: Record<string, string> = { work: "Work", everyday: "Daily life", social: "Social", travel: "Travel", shopping: "Shopping", other: "Other" }

function CoachOutput({ scenario, visible, agent }: { scenario: DemoScenario; visible: (kind: Step["kind"], index?: number) => boolean; agent: AgentKey }) {
  const note = scenario.note
  const diff = useMemo(() => note && noteDiff(note), [note])
  const bullet = agent === "claude" ? "⏺" : undefined
  const toolDone = visible("rule")

  return (
    <div className="coach-output">
      {note && visible("version") && (
        <ul className="coach-list">
          <li className="reveal">
            <span className="coach-key">Your version</span>
            <span className="coach-value">{diff ? <Marked parts={diff.before} kind="removed" /> : note.originalExpression}</span>
          </li>
          {visible("polished") && (
            <li className="reveal">
              <span className="coach-key">Polished version</span>
              <span className="coach-value coach-value--polished">{diff ? <Marked parts={diff.after} kind="added" /> : note.polishedExpression}</span>
              <ul>
                {note.corrections.map((correction, index) => visible("correction", index) && (
                  <li key={correction.original} className="reveal coach-fix">
                    <span className="coach-chip" data-category={correction.category}>{correction.category}</span>
                    <span><s>{correction.original}</s> → <b>{correction.replacement}</b>. {correction.reason}</span>
                  </li>
                ))}
              </ul>
            </li>
          )}
          {visible("patterns") && (
            <li className="reveal">
              <span className="coach-key">Repeat patterns</span>
              <ul>
                {note.patterns.map((pattern) => (
                  <li key={pattern.pattern}><b className="coach-pattern">{pattern.pattern}</b> {pattern.explanation}</li>
                ))}
                {note.examples.map((example) => (
                  <li key={example.text} className="coach-example"><span>{contextLabel[example.context]}:</span> {example.text}</li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
      {!note && visible("verdict") && (
        <p className="coach-verdict reveal"><CheckIcon aria-hidden="true" /> {scenario.verdict}</p>
      )}
      {note && visible("tool") && (
        <div className="tool-call reveal" data-done={toolDone}>
          {agent === "claude" ? (
            <>
              <p><span className="tool-bullet" data-done={toolDone}>{bullet}</span> <b>language-coach - save_learning_note</b> <span className="tool-dim">(MCP)</span></p>
              <p className="tool-result">⎿ {toolDone ? "Saved 1 learning note" : "Running…"}</p>
            </>
          ) : (
            <p>
              <span className="tool-icon" data-done={toolDone}>{toolDone ? <CheckIcon /> : <span className="tool-spinner" />}</span>
              {agent === "codex" ? "Called" : "MCP"} <b>save_learning_note</b>
              <span className="tool-dim">{toolDone ? "language-coach · saved" : "language-coach"}</span>
            </p>
          )}
        </div>
      )}
      {visible("rule") && <hr className="coach-rule reveal" />}
      {scenario.task.map((line, index) => visible("task", index) && (
        <p key={line} className="task-line reveal">
          {agent === "claude"
            ? <><span className="tool-bullet" data-done="true">⏺</span> {line}</>
            : <>{line.startsWith("Edit") || line.startsWith("Read") ? <FileCode2Icon aria-hidden="true" /> : <span className="task-dot" />}{line}</>}
        </p>
      ))}
    </div>
  )
}

function AgentChrome({ agent, children, composer }: { agent: AgentKey; children: ReactNode; composer: ReactNode }) {
  const title = agent === "claude" ? "~/acme-web — claude" : agent === "codex" ? "Codex — acme-web" : "acme-web — Cursor"
  return (
    <div className="agent-window" data-agent={agent}>
      <div className="agent-titlebar">
        <span className="agent-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="agent-title">{title}</span>
        {agent === "cursor" && <span className="agent-titlebar-tab">Agent · Auto</span>}
      </div>
      <div className="agent-transcript">{children}</div>
      {composer}
    </div>
  )
}

export function AgentDemo() {
  const reducedMotion = usePrefersReducedMotion()
  const library = useDemoLibrary()
  const [agent, setAgent] = useState<AgentKey>("claude")
  const [scenarioId, setScenarioId] = useState(scenarios[0]!.id)
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]!
  const [typed, setTyped] = useState(0)
  const [sent, setSent] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [started, setStarted] = useState(false)
  const [autoSend, setAutoSend] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const savedScenarios = useRef(new Set<string>())
  const timeline = useMemo(() => timelineFor(scenario), [scenario])
  const ready = typed >= scenario.prompt.length
  const done = sent && revealed >= timeline.length

  // Start typing the first message once the demo scrolls into view.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || started) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setStarted(true); observer.disconnect() }
    }, { threshold: 0.35 })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [started])

  useEffect(() => {
    if (!started || sent || ready) return
    if (reducedMotion) { setTyped(scenario.prompt.length); return }
    const step = scenario.prompt.length > 60 ? 2 : 1
    const timer = window.setTimeout(() => setTyped((count) => Math.min(scenario.prompt.length, count + step)), 22)
    return () => window.clearTimeout(timer)
  }, [ready, reducedMotion, scenario.prompt.length, sent, started, typed])

  const send = useCallback(() => {
    if (!ready || sent) return
    setAutoSend(false)
    setSent(true)
    setRevealed(0)
  }, [ready, sent])

  // The first, unattended run sends itself so a visitor who only scrolls still sees the whole loop.
  useEffect(() => {
    if (!ready || sent || !autoSend) return
    const timer = window.setTimeout(send, reducedMotion ? 0 : 1400)
    return () => window.clearTimeout(timer)
  }, [autoSend, ready, reducedMotion, send, sent])

  useEffect(() => {
    if (!sent || revealed >= timeline.length) return
    const current = timeline[revealed]!
    const timer = window.setTimeout(() => setRevealed((count) => count + 1), reducedMotion ? 0 : STEP_DELAY[current.kind])
    return () => window.clearTimeout(timer)
  }, [reducedMotion, revealed, sent, timeline])

  const reachedIndex = (kind: Step["kind"], index?: number) => timeline.findIndex((step) => step.kind === kind && (index === undefined || ("index" in step && step.index === index)))
  const visible = (kind: Step["kind"], index?: number) => {
    const position = reachedIndex(kind, index)
    return sent && position >= 0 && revealed > position
  }
  const thinking = sent && revealed === 0
  const toolSaved = visible("rule")

  useEffect(() => {
    if (!toolSaved || !scenario.note || savedScenarios.current.has(scenario.id)) return
    savedScenarios.current.add(scenario.id)
    library.save(scenario.note)
  }, [library, scenario, toolSaved])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (transcript) transcript.scrollTo({ top: transcript.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" })
  }, [reducedMotion, revealed, sent])

  function choose(id: string) {
    setAutoSend(false)
    setStarted(true)
    setScenarioId(id)
    setTyped(0)
    setSent(false)
    setRevealed(0)
  }

  function handleComposerKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") { event.preventDefault(); send() }
  }

  const promptText = scenario.prompt.slice(0, typed)
  const placeholder = agent === "codex" ? "Ask Codex anything" : agent === "cursor" ? "Plan, search, build anything" : "Try “fix lint errors”"

  const composer = (
    <div className="agent-composer-wrap">
      <div
        className="agent-composer"
        role="button"
        tabIndex={0}
        aria-label={ready && !sent ? "Send this message" : "Message composer"}
        aria-disabled={!ready || sent}
        onKeyDown={handleComposerKey}
        onClick={send}
      >
        {agent === "claude" && <span className="composer-caret" aria-hidden="true">&gt;</span>}
        <span className="composer-text" data-empty={!promptText || sent}>
          {sent ? placeholder : promptText || placeholder}
          {!sent && started && !ready && <span className="composer-cursor" aria-hidden="true" />}
        </span>
        <span className="composer-send" data-ready={ready && !sent} aria-hidden="true">
          {agent === "claude" ? <CornerDownLeftIcon /> : <ArrowUpIcon />}
        </span>
      </div>
      <div className="agent-composer-hint" aria-live="polite">
        {ready && !sent ? <><kbd>Enter</kbd> to send</> : done ? "Pick another message below" : sent ? "Coaching first, then the task" : agent === "claude" ? "? for shortcuts" : " "}
      </div>
    </div>
  )

  return (
    <div className="demo-stage" ref={stageRef}>
      <div className="demo-agent-column">
        <div className="demo-agent-tabs" role="tablist" aria-label="Coding agent">
          {agents.map(({ key, label }) => (
            <button key={key} type="button" role="tab" aria-selected={agent === key} data-agent={key} onClick={() => setAgent(key)}>
              <AgentGlyph agent={key} /> {label}
            </button>
          ))}
        </div>

        <AgentChrome agent={agent} composer={composer}>
          <div className="agent-scroll" ref={transcriptRef}>
            {agent === "claude" && (
              <div className="claude-welcome" aria-hidden="true">
                <span>✻</span> Welcome to <b>Claude Code</b>
                <small>/help for help · cwd: ~/acme-web</small>
              </div>
            )}
            {sent ? (
              <>
                <div className="user-message reveal">{agent === "claude" && <span aria-hidden="true">&gt; </span>}{scenario.prompt}</div>
                {thinking && <p className="agent-thinking"><span className="thinking-glyph" aria-hidden="true">{agent === "claude" ? "✻" : ""}</span>{agent === "claude" ? "Coaching…" : "Thinking"}<span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span></p>}
                <CoachOutput scenario={scenario} visible={visible} agent={agent} />
              </>
            ) : (
              <div className="agent-empty">
                <p>Language Coach is installed. Write to your agent the way you normally would.</p>
              </div>
            )}
          </div>
        </AgentChrome>

        <div className="demo-scenarios" role="group" aria-label="Example messages">
          <span>Try a message</span>
          {scenarios.map((item) => (
            <button key={item.id} type="button" aria-pressed={item.id === scenario.id} onClick={() => choose(item.id)}>{item.label}</button>
          ))}
          {done && <button type="button" className="demo-replay" onClick={() => choose(scenario.id)} aria-label="Replay this message"><RotateCcwIcon /></button>}
        </div>
      </div>

      <DemoLibrary library={library} />
    </div>
  )
}
