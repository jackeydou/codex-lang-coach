import type { CorrectionCategory, ExampleContext } from "@language-coach/core"

export type AgentKey = "claude" | "codex" | "cursor"

export type DemoNote = {
  id: string
  originalExpression: string
  polishedExpression: string
  inputLanguage: "target" | "native"
  corrections: Array<{ original: string; replacement: string; reason: string; category: CorrectionCategory }>
  patterns: Array<{ pattern: string; explanation: string }>
  examples: Array<{ context: ExampleContext; text: string }>
}

export type DemoScenario = {
  id: string
  label: string
  prompt: string
  /** Present when the message is worth a saved lesson. */
  note?: DemoNote
  /** Shown instead of a lesson when the message is already natural. */
  verdict?: string
  task: string[]
}

export const scenarios: DemoScenario[] = [
  {
    id: "login-bug",
    label: "Fix a bug",
    prompt: "Can you help me to fix the bug which make the login page crash when user don't input password?",
    note: {
      id: "demo-login-bug",
      inputLanguage: "target",
      originalExpression: "Can you help me to fix the bug which make the login page crash when user don't input password?",
      polishedExpression: "Can you help me fix the bug that crashes the login page when the user doesn't enter a password?",
      corrections: [
        { original: "help me to fix", replacement: "help me fix", category: "grammar", reason: "After “help someone”, use the bare verb. “To” is not wrong, but it sounds stiff." },
        { original: "which make … crash", replacement: "that crashes", category: "structure", reason: "A defining clause takes “that”, and the verb agrees with “the bug”." },
        { original: "user don't input password", replacement: "the user doesn't enter a password", category: "collocation", reason: "People “enter” a password. Singular “the user” takes “doesn't”." },
      ],
      patterns: [
        { pattern: "help [someone] + [verb]", explanation: "Skip “to” after help in everyday English." },
        { pattern: "the [thing] that [verb]s …", explanation: "Describe exactly which thing you mean." },
      ],
      examples: [
        { context: "work", text: "Can you help me review this pull request?" },
        { context: "everyday", text: "Could you help me carry these boxes upstairs?" },
      ],
    },
    task: [
      "Read src/auth/LoginForm.tsx",
      "Found it: password.trim() runs before the empty check.",
      "Edit src/auth/LoginForm.tsx (+4 −1)",
      "Tests pass. The form now shows “Enter a password”.",
    ],
  },
  {
    id: "refactor-zh",
    label: "Write in Chinese",
    prompt: "帮我把这个函数重构一下，让它更容易测试",
    note: {
      id: "demo-refactor-zh",
      inputLanguage: "native",
      originalExpression: "帮我把这个函数重构一下，让它更容易测试",
      polishedExpression: "Refactor this function so it's easier to test.",
      corrections: [
        { original: "帮我…一下", replacement: "(drop it)", category: "tone", reason: "A direct imperative is normal with a coding agent. “Please” is optional." },
        { original: "让它更容易测试", replacement: "so it's easier to test", category: "structure", reason: "“So (that) …” states the goal of the change in one clause." },
      ],
      patterns: [
        { pattern: "[verb] X so it's easier to [verb]", explanation: "用 so 引出改动的目的，比 in order to 更口语。" },
      ],
      examples: [
        { context: "work", text: "Split the config file so it's easier to review." },
        { context: "travel", text: "Let's leave early so it's easier to find parking." },
      ],
    },
    task: [
      "Read lib/pricing.ts",
      "Extracted calculateDiscount() into a pure function.",
      "Added 6 unit tests in lib/pricing.test.ts",
    ],
  },
  {
    id: "button",
    label: "Style a button",
    prompt: "Please make the button more bigger and change it's color to blue.",
    note: {
      id: "demo-button",
      inputLanguage: "target",
      originalExpression: "Please make the button more bigger and change it's color to blue.",
      polishedExpression: "Please make the button bigger and change its color to blue.",
      corrections: [
        { original: "more bigger", replacement: "bigger", category: "grammar", reason: "Short adjectives take “-er” or “more”, never both." },
        { original: "it's", replacement: "its", category: "spelling", reason: "“It's” means “it is”. The possessive has no apostrophe." },
      ],
      patterns: [
        { pattern: "make [something] + [comparative]", explanation: "make it bigger, make it clearer, make it faster." },
      ],
      examples: [
        { context: "work", text: "Can we make the onboarding shorter?" },
        { context: "shopping", text: "Do you have this in a bigger size?" },
      ],
    },
    task: [
      "Edit components/Button.tsx (+2 −2)",
      "Changed size to lg and the variant to blue.",
    ],
  },
  {
    id: "natural",
    label: "Already natural",
    prompt: "Add a loading spinner to the checkout button while the payment is processing.",
    verdict: "This already sounds natural. Nothing to correct, so nothing is saved.",
    task: [
      "Edit components/CheckoutButton.tsx (+9 −1)",
      "The button shows a spinner and is disabled while paying.",
    ],
  },
]

export const seedNotes: DemoNote[] = [
  {
    id: "seed-1",
    inputLanguage: "target",
    originalExpression: "Change current dashboard website to a multiple pages website.",
    polishedExpression: "Turn the current dashboard into a multi-page site.",
    corrections: [{ original: "multiple pages website", replacement: "multi-page site", category: "word-choice", reason: "Compound adjectives before a noun use the singular." }],
    patterns: [{ pattern: "Turn [X] into [Y]", explanation: "Describe a change in form." }],
    examples: [{ context: "work", text: "Turn these notes into a short report." }],
  },
  {
    id: "seed-2",
    inputLanguage: "target",
    originalExpression: "Could you make this email more politely?",
    polishedExpression: "Could you make this email more polite?",
    corrections: [{ original: "politely", replacement: "polite", category: "grammar", reason: "After “make something”, use an adjective." }],
    patterns: [{ pattern: "make [something] + [adjective]", explanation: "make it polite, make it clear." }],
    examples: [{ context: "social", text: "Can you make the invite a bit more casual?" }],
  },
  {
    id: "seed-3",
    inputLanguage: "target",
    originalExpression: "I want to discuss about the deploy plan tomorrow.",
    polishedExpression: "I'd like to discuss the deploy plan tomorrow.",
    corrections: [{ original: "discuss about", replacement: "discuss", category: "collocation", reason: "“Discuss” takes a direct object." }],
    patterns: [{ pattern: "I'd like to [verb]", explanation: "A softer “I want to”." }],
    examples: [{ context: "work", text: "I'd like to walk through the migration first." }],
  },
]

export const seedPatterns = [
  { pattern: "Turn [X] into [Y]", count: 6 },
  { pattern: "make [something] + [adjective]", count: 4 },
  { pattern: "I'd like to [verb]", count: 3 },
]

export const seedCategories: Array<{ category: CorrectionCategory; count: number }> = [
  { category: "word-choice", count: 14 },
  { category: "grammar", count: 11 },
  { category: "collocation", count: 8 },
  { category: "structure", count: 5 },
  { category: "tone", count: 3 },
]

/** Twenty-four weeks of deterministic practice history, oldest first, with today last. */
export const seedActivity = Array.from({ length: 168 }, (_, index) => {
  if (index === 167) return 0
  const wave = Math.sin(index * 0.9) + Math.sin(index * 0.37 + 1)
  const weekend = index % 7 === 5 || index % 7 === 6
  if (wave < -0.6 || (weekend && index % 3)) return 0
  return Math.max(1, Math.round((wave + 1.4) * 1.3 + (index > 120 ? 1 : 0)))
})

export const agents: Array<{
  key: AgentKey
  label: string
  surface: string
  prompt: string
  commands: string[]
  manual: string[]
}> = [
  {
    key: "claude",
    label: "Claude Code",
    surface: "Paste into a Claude Code session",
    prompt: "Read https://language-coach.pluginsfoundry.dev/claude and install the Language Coach plugin for me. When setup is complete, tell me to start a new session.",
    commands: [
      "claude plugin marketplace add jackeydou/codex-lang-coach@marketplace-cc",
      "claude plugin install language-coach@language-coach",
    ],
    manual: ["Run both commands in your terminal.", "Start a new Claude Code session so the hooks and MCP tools load."],
  },
  {
    key: "codex",
    label: "Codex",
    surface: "Paste into any task in the Codex app",
    prompt: "/goal Read https://language-coach.pluginsfoundry.dev/codex and install the Language Coach plugin for me. When setup is complete, start a new task so the plugin is active.",
    commands: [
      "codex plugin marketplace add jackeydou/codex-lang-coach --ref marketplace",
      "codex plugin add language-coach@language-coach",
    ],
    manual: ["Or in the app: Plugins → Add → source jackeydou/codex-lang-coach, ref marketplace.", "Trust the plugin hooks, then start a new task."],
  },
  {
    key: "cursor",
    label: "Cursor",
    surface: "Paste into the Cursor agent for your workspace",
    prompt: "Read https://language-coach.pluginsfoundry.dev/cursor and install the Language Coach plugin for this workspace.",
    commands: [
      "git clone -b marketplace-cursor https://github.com/jackeydou/codex-lang-coach.git",
      "cp -R codex-lang-coach/plugins/language-coach ~/.cursor/plugins/local/language-coach",
    ],
    manual: ["Or add the marketplace-cursor branch through your team marketplace.", "Enable the sessionStart and stop hooks, then start a new agent session."],
  },
]
