import { ArrowDownIcon, ArrowRightIcon, CheckIcon, PlusIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { PREMIUM_PLANS, type PremiumPlan } from "@language-coach/core/types"

import { initializeAuth, readAuthSession } from "@/auth-client"
import { planSummary } from "@/components/premium-card"
import { AgentDemo } from "@/landing/agent-demo"
import { AgentGlyph } from "@/landing/agent-glyph"
import { InstallSection } from "@/landing/install-section"

const REPOSITORY_URL = "https://github.com/jackeydou/codex-lang-coach"
const PREMIUM_RETURN = "/dashboard/settings?premium=required"

const steps = [
  { title: "Write", body: "Send your agent a message the way you always do, in English or in your own language." },
  { title: "Coach", body: "Before it starts the task, the agent shows a natural rewrite and the few fixes that matter." },
  { title: "Keep", body: "Lessons worth keeping are saved as structured notes. Natural messages are left alone." },
  { title: "Review", body: "Saved notes become flash cards on a review schedule, with patterns and progress beside them." },
]

const features = [
  { title: "Corrections that keep your voice", body: "Grammar, spelling, collocations, word choice and tone, rewritten the way a native speaker would say it in the same situation." },
  { title: "Translation from your first language", body: "Write the request in Chinese, Spanish or any native language and learn how it sounds in natural English." },
  { title: "Patterns you can reuse", body: "Each lesson extracts the structure behind the fix, with examples at work, while travelling and in daily life." },
  { title: "Flash cards with spaced review", body: "Cards come back when they are due. Mark them reviewed and they return later, until the pattern sticks." },
  { title: "Activity you can read", body: "A 90-day heatmap, your streak, the share of messages written in your target language and where corrections cluster." },
  { title: "Local first, open source", body: "Notes live in SQLite on your computer. The code is AGPL, so you can read it, fork it or host sync yourself." },
]

const questions: Array<[string, string, "premium"?]> = [
  ["Does it replace my coding agent?", "No. It adds a short coaching block before the reply, then your agent completes the task you asked for in the same turn."],
  ["Will every message become a lesson?", "No. A note is saved only when there is a meaningful correction or a reusable pattern. Natural messages, and changes that are only plural or tense fixes, are skipped."],
  ["What exactly is saved?", "Your original expression, the polished version, the corrections, reusable patterns and transfer examples. Nothing else."],
  ["Does it save my code or task details?", "No. Source files, repository names, private context and the answer to your task never enter your learning history."],
  ["Which agents are supported?", "Claude Code, Codex (app and CLI) and Cursor. Each one gets a native plugin with the same coaching hook, MCP tools and dashboard."],
  ["Which languages can I learn?", "Set any native and target language in the dashboard. Explanations use your native language when that is clearer."],
  ["What does Premium add?", "Remote sync on the hosted service. Every computer uploads its notes to your private account, and you can review all of them in the web dashboard. Coaching and the local dashboard stay free.", "premium"],
  ["Can I cancel or self-host?", "Cancel anytime from Manage billing; your local notes are untouched. The sync service is open source, so you can also run it yourself for free.", "premium"],
  ["Does coaching slow my agent down?", "The coaching block is brief and arrives first. Your agent keeps working in the same reply."],
]

function GithubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1 1.6 1 .9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.7-1.3-2.3-.3-4.7-1.1-4.7-5a4 4 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1.1a9.6 9.6 0 0 1 5.1 0C16.6 5.7 17.4 6 17.4 6c.6 1.4.2 2.4.1 2.7a4 4 0 0 1 1.1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7 1 .7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
    </svg>
  )
}

function ProductMark({ className = "lp-mark" }: { className?: string }) {
  return <img className={className} src="/assets/language-coach-icon.png" alt="" />
}

function PricingSection({ signedIn }: { signedIn: boolean }) {
  const [plan, setPlan] = useState<PremiumPlan>("yearly")
  const selected = PREMIUM_PLANS.find((item) => item.id === plan) ?? PREMIUM_PLANS[0]
  const summary = planSummary(selected)
  const premiumHref = signedIn ? PREMIUM_RETURN : `/sign-up?returnTo=${encodeURIComponent(PREMIUM_RETURN)}`

  return (
    <section className="lp-section lp-pricing" id="pricing" aria-labelledby="pricing-title">
      <div className="lp-section-head">
        <p className="eyebrow">Pricing</p>
        <h2 id="pricing-title">Free to learn.<br />Premium to sync.</h2>
        <p>Coaching, flash cards and insights cost nothing. Premium brings the notes from every computer into one private library on the web.</p>
      </div>

      <div className="lp-plans">
        <article className="lp-plan">
          <header>
            <h3>Free</h3>
            <p className="lp-price"><span>$0</span><small>forever</small></p>
            <p>Everything on the computer you code on. No account needed.</p>
          </header>
          <ul>
            <li><CheckIcon /> Coaching in Claude Code, Codex and Cursor</li>
            <li><CheckIcon /> Saved lessons with patterns and examples</li>
            <li><CheckIcon /> Flash cards with spaced review</li>
            <li><CheckIcon /> Activity heatmap and correction insights</li>
          </ul>
          <a className="lp-button lp-button--ghost" href="#install">Install for free</a>
        </article>

        <article className="lp-plan lp-plan--premium">
          <header>
            <div className="lp-plan-title"><h3>Premium</h3>{summary.savings && <span className="lp-save">{summary.savings}</span>}</div>
            <div className="lp-period" role="radiogroup" aria-label="Billing period">
              {PREMIUM_PLANS.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={item.id === plan} onClick={() => setPlan(item.id)}>{item.label}</button>
              ))}
            </div>
            <p className="lp-price" aria-live="polite"><span key={plan}>{summary.price}</span><small>{summary.period}{summary.perMonth && <> · {summary.perMonth}</>}</small></p>
            <p>Your whole library, from every machine, in one place.</p>
          </header>
          <ul>
            <li><PlusIcon /> Everything in Free</li>
            <li><CheckIcon /> Upload notes from every computer you use</li>
            <li><CheckIcon /> Review all lessons in the web dashboard</li>
            <li><CheckIcon /> Cancel anytime; local notes stay yours</li>
          </ul>
          <Link className="lp-button" to={premiumHref}>{signedIn ? "Choose Premium" : "Create account"} <ArrowRightIcon /></Link>
          <p className="lp-plan-note">Payments are handled by Stripe.</p>
        </article>
      </div>
      <p className="lp-pricing-foot">Prefer to host sync yourself? <a href={REPOSITORY_URL}>The whole service is open source</a> and free to run.</p>
    </section>
  )
}

export function LandingPage() {
  const [authStatus, setAuthStatus] = useState<"checking" | "signed-out" | "signed-in">("checking")
  const [premiumOffered, setPremiumOffered] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { runtime, auth } = await initializeAuth()
        if (active) setPremiumOffered(Boolean(runtime.premiumSyncRequired))
        const session = auth ? await readAuthSession(auth) : undefined
        if (active) setAuthStatus(session ? "signed-in" : "signed-out")
      } catch {
        if (active) setAuthStatus("signed-out")
      }
    })()
    return () => { active = false }
  }, [])

  const signedIn = authStatus === "signed-in"

  return (
    <main className="lp">
      <a className="skip-link" href="#demo">Skip to the demo</a>
      <header className="lp-header">
        <a href="#top" className="lp-brand" aria-label="Language Coach home"><ProductMark /><span>Language Coach</span></a>
        <nav className="lp-nav" aria-label="Sections">
          <a href="#demo">Demo</a>
          <a href="#how">How it works</a>
          <a href="#install">Install</a>
          {premiumOffered && <a href="#pricing">Pricing</a>}
          <a href="#faq">FAQ</a>
        </nav>
        <nav className="lp-account" aria-label="Account" aria-busy={authStatus === "checking"}>
          <a className="lp-icon-link" href={REPOSITORY_URL} aria-label="Source code on GitHub"><GithubIcon /></a>
          {signedIn && <Link className="lp-button lp-button--small" to="/dashboard">Dashboard</Link>}
          {authStatus === "signed-out" && <Link className="lp-text-link" to="/sign-in">Sign in</Link>}
        </nav>
      </header>

      <section className="lp-hero" id="top">
        <p className="lp-hero-kicker">A plugin for <AgentGlyph agent="claude" /> Claude Code, <AgentGlyph agent="codex" /> Codex and <AgentGlyph agent="cursor" /> Cursor</p>
        <h1>
          <span>Learn English</span>
          <span className="lp-hero-edit">
            <del>after work.</del>
            <ins>while you ship.</ins>
          </span>
        </h1>
        <div className="lp-hero-foot">
          <p>Language Coach reads every message you send your coding agent, shows the natural way to say it, saves the lessons worth keeping and turns them into flash cards. Then your agent gets on with the task.</p>
          <div className="lp-hero-actions">
            <a className="lp-button" href="#install">Install in your agent <ArrowRightIcon /></a>
            <a className="lp-text-link" href="#demo">Try it here <ArrowDownIcon /></a>
          </div>
        </div>
      </section>

      <section className="lp-demo" id="demo" aria-labelledby="demo-title">
        <div className="lp-demo-head">
          <h2 id="demo-title">Send a message. Watch the lesson land.</h2>
          <p>This is what happens inside your agent. Switch agents, pick a message, then flip the card it saves.</p>
        </div>
        <AgentDemo />
      </section>

      <section className="lp-section lp-how" id="how" aria-labelledby="how-title">
        <div className="lp-section-head">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">No study plan.<br />Your prompts are the curriculum.</h2>
        </div>
        <ol className="lp-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="lp-step-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <dl className="lp-features">
          {features.map((feature) => (
            <div key={feature.title}><dt>{feature.title}</dt><dd>{feature.body}</dd></div>
          ))}
        </dl>
      </section>

      <section className="lp-section lp-install" id="install" aria-labelledby="install-title">
        <div className="lp-section-head">
          <p className="eyebrow">Install</p>
          <h2 id="install-title">One minute, in the agent you already use.</h2>
          <p>Hand your agent one sentence and it installs itself, or run two commands.</p>
        </div>
        <InstallSection />
      </section>

      <section className="lp-section lp-privacy" aria-labelledby="privacy-title">
        <div className="lp-section-head">
          <p className="eyebrow">Privacy</p>
          <h2 id="privacy-title">Your task is not the lesson.</h2>
          <p>The coach keeps the language and leaves your work where it belongs. Notes stay on your computer unless you turn on sync.</p>
        </div>
        <figure className="lp-privacy-figure">
          <p className="lp-privacy-message">
            Can you <mark>help me to fix</mark> the bug <mark>which make</mark> <span className="lp-redact">src/auth/LoginForm.tsx</span> crash when <mark>user don't input password</mark>? The stack trace is <span className="lp-redact">TypeError at line 42…</span>
          </p>
          <figcaption>
            <div><span className="lp-key lp-key--keep" /> Saved as a lesson: your wording, the fix, the pattern, examples</div>
            <div><span className="lp-key lp-key--drop" /> Never saved: files, code, stack traces, the answer to your task</div>
          </figcaption>
        </figure>
      </section>

      {premiumOffered && <PricingSection signedIn={signedIn} />}

      <section className="lp-section lp-faq" id="faq" aria-labelledby="faq-title">
        <div className="lp-section-head">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title">Questions</h2>
        </div>
        <div className="lp-faq-list">
          {questions.filter(([, , audience]) => audience !== "premium" || premiumOffered).map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<PlusIcon aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-closing">
        <h2>Your next prompt is your next lesson.</h2>
        <div className="lp-hero-actions">
          <a className="lp-button lp-button--light" href="#install">Install Language Coach <ArrowRightIcon /></a>
          {signedIn
            ? <Link className="lp-text-link" to="/dashboard">Open dashboard</Link>
            : authStatus === "signed-out" && <Link className="lp-text-link" to="/sign-up">Create an account</Link>}
        </div>
      </section>

      <footer className="lp-footer">
        <span className="lp-brand"><ProductMark /><span>Language Coach</span></span>
        <span>Open source under AGPL-3.0. Built for learners who code.</span>
        <nav aria-label="Legal">
          <a href={REPOSITORY_URL}>GitHub</a>
          <Link to="/privacy-policy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  )
}
