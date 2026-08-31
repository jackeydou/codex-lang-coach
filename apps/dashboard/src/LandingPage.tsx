import {
  BarChart3Icon,
  SparklesIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"
import { Link } from "react-router-dom"

import { initializeAuth, readAuthSession } from "@/auth-client"

const covers = [
  { title: "Gentle\nCorrections", detail: "Clear feedback that keeps your meaning intact.", className: "cover-orange" },
  { title: "Natural\nPhrasing", detail: "Everyday English that sounds like you.", className: "cover-cream" },
  { title: "Task\nFirst", detail: "Coaching happens, then Codex gets to work.", className: "cover-blue" },
  { title: "Useful\nLessons", detail: "Only high-value notes are saved for review.", className: "cover-green" },
  { title: "Private by\nDesign", detail: "Local by default, with optional private sync.", className: "cover-black" },
]

const questions = [
  ["Does Language Coach replace Codex?", "No. It briefly reviews the language in your message, offers a natural rewrite, and then Codex completes the task you originally requested."],
  ["Will every message become a lesson?", "No. Notes are saved only when there is a meaningful correction or a reusable pattern worth practicing. Natural messages are left alone."],
  ["What does it save?", "Only language-learning material: your original expression, the polished version, concise corrections, reusable patterns, and transfer examples."],
  ["Does it save my task details or files?", "No. Unrelated task context, source files, private data, and the answer to your task stay outside your learning history."],
  ["Where is my learning history stored?", "Your dashboard is local-first. You can keep everything on this device or choose private account sync when you want access across devices."],
  ["Which languages can I use?", "Choose your native and target languages in settings. The coach uses that pair to explain corrections at the right level."],
  ["Can I remove a saved lesson?", "Yes. You control your learning history and can delete any lesson you no longer want to keep."],
  ["Will coaching slow down my tasks?", "The coaching step is intentionally brief. It appears first, then Codex continues with your task in the same conversation."],
]

function Rule() {
  return <div className="landing-rule" aria-hidden="true" />
}

function ProductMark() {
  return <img className="landing-product-mark" src="/assets/language-coach-icon.png" alt="" />
}

type AnimationSurface = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function drawCorrectionWave(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const columns = 34
  context.lineWidth = 1.7
  for (let index = 0; index < columns; index += 1) {
    const progress = index / (columns - 1)
    const x = 7 + progress * (width - 14)
    const envelope = 0.25 + 0.75 * Math.abs(Math.sin(progress * Math.PI * 2.2 - time * 1.15))
    const jitter = 0.7 + 0.3 * Math.sin(index * 1.91 + time * 2.1)
    const barHeight = 18 + envelope * jitter * (height - 30)
    const center = height * 0.5 + Math.sin(index * 0.62 + time * 1.4) * 6
    context.globalAlpha = 0.72 + envelope * 0.28
    context.beginPath()
    context.moveTo(x, center - barHeight * 0.5)
    context.lineTo(x, center + barHeight * 0.5)
    context.stroke()
  }
  context.globalAlpha = 1
}

function drawPhrasingGrid(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const columns = 12
  const rows = 7
  const gap = 3
  const cellWidth = (width - gap * (columns - 1)) / columns
  const cellHeight = (height - gap * (rows - 1)) / rows
  const scanner = ((time * 1.4) % (columns + 3)) - 1
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const distance = Math.abs(column - scanner)
      const pulse = Math.max(0, 1 - distance / 2.5)
      const phrase = Math.sin(column * 0.72 + row * 1.31 + time * 0.8) > 0.72 ? 0.28 : 0
      context.globalAlpha = 0.42 + pulse * 0.48 + phrase
      context.fillRect(column * (cellWidth + gap), row * (cellHeight + gap), cellWidth, cellHeight)
    }
  }
  context.globalAlpha = 1
}

function drawTaskPipeline(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const labels = ["REQUEST", "COACH", "EXECUTE"]
  const trackWidth = width - 30
  const rowHeight = Math.max(18, height * 0.16)
  const gap = Math.max(9, height * 0.085)
  const totalHeight = labels.length * rowHeight + (labels.length - 1) * gap
  const startY = (height - totalHeight) * 0.5
  const phase = (time * 0.42) % labels.length

  context.font = `600 ${Math.max(8, width / 32)}px system-ui, sans-serif`
  context.textBaseline = "middle"
  context.lineWidth = 1.25
  labels.forEach((label, index) => {
    const y = startY + index * (rowHeight + gap)
    const active = Math.max(0, 1 - Math.abs(index - phase) / 0.72)
    context.globalAlpha = 0.42 + active * 0.58
    drawRoundedRect(context, 4, y, trackWidth, rowHeight, rowHeight * 0.5)
    context.stroke()
    context.fillText(label, 14, y + rowHeight * 0.52)

    const progress = (time * 0.65 + index * 0.33) % 1
    const pulseX = 12 + progress * (trackWidth - 24)
    context.beginPath()
    context.arc(pulseX, y + rowHeight * 0.5, 2.6 + active * 1.8, 0, Math.PI * 2)
    context.fill()

    if (index < labels.length - 1) {
      context.globalAlpha = 0.5
      context.beginPath()
      context.moveTo(width * 0.5, y + rowHeight)
      context.lineTo(width * 0.5, y + rowHeight + gap)
      context.stroke()
    }
  })
  context.globalAlpha = 1
}

function drawHackerTerminal(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const glyphs = "A7?+={}[]01<>/\\"
  const columns = 16
  const rows = 7
  const tick = Math.floor(time * 7)
  const fontSize = Math.max(8, Math.min(15, width / 20))
  const cellWidth = width / columns
  const cellHeight = (height - fontSize * 1.8) / rows
  context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
  context.textBaseline = "top"

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const changes = (row * 11 + column * 7 + tick * (1 + (row + column) % 3)) % glyphs.length
      const char = glyphs[changes] ?? "0"
      const scanner = (tick % rows) === row
      context.globalAlpha = scanner ? 1 : 0.38 + ((row + column) % 4) * 0.14
      context.fillText(char, column * cellWidth, row * cellHeight)
    }
  }

  context.globalAlpha = 0.95
  const command = `> PATTERN_${String((tick % 24) + 1).padStart(2, "0")} SAVED`
  context.fillText(command, 0, height - fontSize * 1.25)
  context.globalAlpha = 1
}

function drawPrivateOrbit(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const centerX = width * 0.5
  const centerY = height * 0.5
  const radius = Math.min(width, height) * 0.32
  context.lineWidth = 1.2

  context.globalAlpha = 0.72
  for (let ring = 0; ring < 3; ring += 1) {
    const ringRadius = radius * (0.52 + ring * 0.24)
    const start = time * (0.2 + ring * 0.08) + ring
    context.beginPath()
    context.arc(centerX, centerY, ringRadius, start, start + Math.PI * (1.05 + ring * 0.18))
    context.stroke()
  }

  const nodes = 8
  for (let index = 0; index < nodes; index += 1) {
    const angle = time * (index % 2 ? -0.24 : 0.3) + index / nodes * Math.PI * 2
    const orbit = radius * (0.62 + (index % 3) * 0.16)
    const x = centerX + Math.cos(angle) * orbit
    const y = centerY + Math.sin(angle) * orbit
    context.globalAlpha = 0.42 + (index % 3) * 0.22
    context.beginPath()
    context.arc(x, y, 2.2 + (index % 2), 0, Math.PI * 2)
    context.fill()
  }

  context.globalAlpha = 1
  context.beginPath()
  context.arc(centerX, centerY, radius * 0.28 + Math.sin(time * 1.1) * 2, 0, Math.PI * 2)
  context.stroke()
  context.font = `600 ${Math.max(8, width / 27)}px system-ui, sans-serif`
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText("LOCAL", centerX, centerY)
  context.textAlign = "start"
}

const coverDrawers = [drawCorrectionWave, drawPhrasingGrid, drawTaskPipeline, drawHackerTerminal, drawPrivateOrbit]

function createAnimationSurface(canvas: HTMLCanvasElement): AnimationSurface | null {
  const context = canvas.getContext("2d")
  return context ? { canvas, context } : null
}

function useCoverAnimations(fanRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const fan = fanRef.current
    if (!fan) return

    const surfaces = Array.from(fan.querySelectorAll<HTMLCanvasElement>("[data-cover-animation]"))
      .map(createAnimationSurface)
      .filter((surface): surface is AnimationSurface => surface !== null)
    if (!surfaces.length) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let visible = false
    let frame = 0
    let start = performance.now()

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      surfaces.forEach(({ canvas }) => {
        const rect = canvas.getBoundingClientRect()
        const width = Math.max(1, Math.round(rect.width * pixelRatio))
        const height = Math.max(1, Math.round(rect.height * pixelRatio))
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
      })
    }

    const draw = (now: number) => {
      const elapsed = reduceMotion.matches ? 0 : (now - start) / 1000
      surfaces.forEach(({ canvas, context }, index) => {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
        const width = canvas.width / pixelRatio
        const height = canvas.height / pixelRatio
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
        context.clearRect(0, 0, width, height)
        const color = getComputedStyle(canvas).color
        context.strokeStyle = color
        context.fillStyle = color
        const focused = canvas.closest(".learning-cover")?.classList.contains("learning-cover--focused")
        coverDrawers[index]?.(context, width, height, elapsed * (focused ? 1.25 : 1))
      })
    }

    const tick = (now: number) => {
      draw(now)
      if (visible && !reduceMotion.matches) {
        frame = requestAnimationFrame(tick)
      }
    }

    const restart = () => {
      cancelAnimationFrame(frame)
      resize()
      start = performance.now()
      draw(start)
      if (visible && !reduceMotion.matches) {
        frame = requestAnimationFrame(tick)
      }
    }

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting)
      restart()
    }, { threshold: 0.05 })
    const resizeObserver = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })

    reduceMotion.addEventListener("change", restart)
    intersectionObserver.observe(fan)
    surfaces.forEach(({ canvas }) => resizeObserver.observe(canvas))
    restart()

    return () => {
      cancelAnimationFrame(frame)
      reduceMotion.removeEventListener("change", restart)
      intersectionObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [fanRef])
}

function Quote({ children, name, role }: { children: string; name: string; role: string }) {
  return (
    <section className="landing-quote">
      <Rule />
      <blockquote>“{children}”</blockquote>
      <div className="landing-attribution">
        <ProductMark />
        <div><strong>{name}</strong><span>{role}</span></div>
      </div>
    </section>
  )
}

function LessonPreview() {
  return (
    <article className="preview-paper preview-paper--lesson">
      <p className="preview-kicker">Word choice</p>
      <div className="preview-example">
        <span>Before</span>
        <p>Change current dashboard website to a multiple pages website.</p>
      </div>
      <div className="preview-divider" />
      <div className="preview-example preview-example--after">
        <span>After</span>
        <p>Turn the current dashboard into a multi-page site.</p>
      </div>
      <p className="preview-note">“Multi-page” works as a compound adjective before a noun.</p>
    </article>
  )
}

function PatternPreview() {
  return (
    <article className="preview-paper preview-paper--patterns">
      <div className="mini-window-bar"><i /><i /><i /></div>
      <div className="pattern-preview-copy">
        <SparklesIcon />
        <p className="preview-kicker">Reusable pattern</p>
        <h3>Turn [X] into [Y].</h3>
        <p>Use this structure to describe a clear change in state or form.</p>
        <div className="pattern-example">Turn these notes into a short report.</div>
      </div>
    </article>
  )
}

function ProgressPreview() {
  return (
    <article className="preview-paper preview-paper--progress">
      <div className="progress-preview-head">
        <div><p className="preview-kicker">Your progress</p><h3>Patterns becoming habits</h3></div>
        <BarChart3Icon />
      </div>
      <ol>
        <li><span>Natural requests</span><b>18</b></li>
        <li><span>Useful patterns saved</span><b>7</b></li>
        <li><span>Lessons reviewed</span><b>12</b></li>
      </ol>
      <div className="progress-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
    </article>
  )
}

export function LandingPage() {
  const coverFanRef = useRef<HTMLDivElement>(null)
  const [focusedCover, setFocusedCover] = useState<number | null>(null)
  const [authStatus, setAuthStatus] = useState<"checking" | "signed-out" | "signed-in">("checking")
  useCoverAnimations(coverFanRef)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { auth } = await initializeAuth()
        const session = auth ? await readAuthSession(auth) : undefined
        if (active) setAuthStatus(session ? "signed-in" : "signed-out")
      } catch {
        if (active) setAuthStatus("signed-out")
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (focusedCover === null) return
    const clearFocusFromBlankSpace = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && !target.closest(".learning-cover")) {
        setFocusedCover(null)
      }
    }
    document.addEventListener("pointerdown", clearFocusFromBlankSpace)
    return () => document.removeEventListener("pointerdown", clearFocusFromBlankSpace)
  }, [focusedCover])

  return (
    <main className="landing-page">
      <header className="landing-header">
        <a href="#top" className="landing-home-link" aria-label="Language Coach home"><ProductMark /></a>
        <nav className="landing-account-nav" aria-label="Account" aria-busy={authStatus === "checking"}>
          {authStatus === "signed-in" && <Link className="landing-login-link" to="/dashboard">Dashboard</Link>}
          {authStatus === "signed-out" && <Link className="landing-signin-link" to="/sign-in">Sign in</Link>}
        </nav>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-column landing-column--center">
          <h1>Language Coach</h1>
          <p>A quiet learning companion for people who want to write natural English while getting real work done.</p>
        </div>
      </section>

      <section className={`cover-stage${focusedCover !== null ? " cover-stage--focused" : ""}`} aria-label="What Language Coach helps with">
        <div className={`cover-fan${focusedCover !== null ? " cover-fan--focused" : ""}`} ref={coverFanRef}>
          {covers.map(({ title, detail, className }, index) => (
            <button
              type="button"
              className={`learning-cover ${className}${focusedCover === index ? " learning-cover--focused" : ""}`}
              key={title}
              aria-pressed={focusedCover === index}
              aria-label={`${title.replace("\n", " ")}. ${detail}`}
              onClick={() => setFocusedCover((current) => current === index ? null : index)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFocusedCover(null)
              }}
            >
              <canvas className="cover-animation" data-cover-animation aria-hidden="true" />
              <h2>{title.split("\n").map((line) => <span key={line}>{line}</span>)}</h2>
              <p>{detail}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="landing-story landing-column">
        <p>Most language tools ask you to stop what you are doing and practice somewhere else. Your real conversations, decisions, and work happen in another place.</p>
        <p>Language Coach learns in the moment that already matters.</p>
        <p>You write a request in English. The coach checks it for grammar, clarity, tone, and natural phrasing. Then Codex completes your task as usual. Only the language lesson is remembered—never the unrelated work behind it.</p>
      </section>

      <Quote name="Language Coach" role="A learning principle">
        The best correction keeps your meaning, respects your voice, and lets you continue without losing your train of thought.
      </Quote>

      <section className="landing-library" id="library">
        <div className="landing-column">
          <h2>Learning Library</h2>
          <p>Your dashboard becomes a calm record of the English you actually use. It brings corrections, reusable patterns, and progress together without turning your private work into study material.</p>
          <p>Every note is short, focused, and designed to be useful again. Review a correction, practice a pattern in a new setting, or notice which kinds of mistakes are already disappearing.</p>
        </div>
        <div className="library-previews" aria-label="Dashboard previews">
          <div><LessonPreview /><p>Corrections</p></div>
          <div><PatternPreview /><p>Reusable Patterns</p></div>
          <div><ProgressPreview /><p>Progress</p></div>
        </div>
      </section>

      <Quote name="Language Coach" role="Privacy by design">
        Your task is not the lesson. We keep the language insight and leave the rest of your work where it belongs.
      </Quote>

      <section className="landing-about landing-column">
        <h2>How it works</h2>
        <p>Language Coach runs before Codex responds. It reads the language in your message, explains only meaningful issues, and offers a polished version that sounds natural in contemporary English.</p>
        <div className="workflow-gallery" aria-label="Language Coach workflow previews">
          <article className="workflow-gallery-card workflow-gallery-card--coach">
            <div className="workflow-gallery-bar"><span /><span /><span /></div>
            <div className="workflow-gallery-copy">
              <p className="preview-kicker">Coach response</p>
              <p className="workflow-original">“Can you help me to make this email more politely?”</p>
              <div className="workflow-suggestion"><SparklesIcon /><div><strong>Natural version</strong><p>“Can you help me make this email more polite?”</p></div></div>
              <p className="workflow-explanation">Use the adjective <em>polite</em> after “make,” and omit “to” after “help me.”</p>
            </div>
          </article>
          <article className="workflow-gallery-card workflow-gallery-card--dashboard">
            <div className="workflow-dashboard-head"><ProductMark /><div><span>Language Coach</span><strong>Learning Dashboard</strong></div></div>
            <div className="workflow-dashboard-content">
              <p className="preview-kicker">This week</p>
              <strong>Small corrections.<br />Visible progress.</strong>
              <div className="workflow-stat"><span>Lessons saved</span><b>7</b></div>
              <div className="workflow-stat"><span>Patterns practiced</span><b>12</b></div>
              <div className="workflow-stat"><span>Natural messages</span><b>18</b></div>
            </div>
          </article>
        </div>
        <p>The coach uses your native and target languages to keep explanations clear. Over time, the dashboard reveals recurring patterns, shows what you have practiced, and helps corrections become habits.</p>
      </section>

      <Quote name="Language Coach" role="Built for everyday use">
        You do not need to create a study plan. Bring your English to the work you already have, and the curriculum appears naturally.
      </Quote>

      <section className="landing-membership landing-column">
        <h2>Your learning, in one place</h2>
        <p>Open the dashboard to review saved lessons, flip through corrections, see recurring patterns, and manage your language pair. Keep notes local, or turn on private sync when you choose.</p>
        <div className="landing-cta-row">
          {authStatus === "signed-in" && <Link className="landing-cta" to="/dashboard">Open dashboard</Link>}
          {authStatus === "signed-out" && <Link className="landing-cta" to="/sign-up">Create account</Link>}
        </div>
      </section>

      <section className="landing-faq landing-column" id="questions">
        <h2>Questions</h2>
        <dl>
          {questions.map(([question, answer]) => <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}
        </dl>
      </section>

      <footer className="landing-footer">
        <span>© 2026 Language Coach. Open source and built for learners.</span>
        <nav aria-label="Legal pages">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
        </nav>
      </footer>
    </main>
  )
}
