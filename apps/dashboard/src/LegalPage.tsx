import { ArrowLeftIcon, LanguagesIcon } from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { Link } from "react-router-dom"

const LAST_UPDATED = "August 31, 2026"
const REPOSITORY_URL = "https://github.com/jackeydou/codex-lang-coach"

type LegalSection = {
  title: string
  content: ReactNode
}

const privacySections: LegalSection[] = [
  {
    title: "What this policy covers",
    content: <p>This policy explains how Language Coach handles information when you use the Codex plugin, the local dashboard, the hosted website, an account, or optional remote sync.</p>,
  },
  {
    title: "Information we process",
    content: <>
      <p>Language Coach may process the following information:</p>
      <ul>
        <li><strong>Account information.</strong> If you register, Neon Auth processes your name, email address, account identifier, verification status, login method, and authentication session. If you use Google or GitHub, that provider shares the basic profile information you approve.</li>
        <li><strong>Language settings.</strong> Your native language, target language, and whether coaching is enabled.</li>
        <li><strong>Learning notes.</strong> The expression being coached, its polished version, correction categories and explanations, reusable patterns, transfer examples, language classification, optional turn identifier, and timestamps.</li>
        <li><strong>Sync information.</strong> Account identifiers, hashed device-sync tokens, sync timestamps, and deletion records used to keep devices consistent.</li>
        <li><strong>Technical information.</strong> Our hosting, database, authentication, and OAuth providers may process IP addresses, browser and device details, request metadata, cookies, and diagnostic or security logs when they operate the service.</li>
      </ul>
    </>,
  },
  {
    title: "What we do not save as learning history",
    content: <p>Language Coach is designed not to save unrelated task details, source files, attachments, private task context, or the answer to your task as a learning note. A note is saved only when there is a meaningful correction or a useful reusable language pattern.</p>,
  },
  {
    title: "Local storage and optional sync",
    content: <>
      <p>Local use does not require an account. By default, learning notes and settings are stored in a SQLite database on your device.</p>
      <p>If you turn on login and sync, your account information is handled by Neon Auth and your learning profile and notes are stored in Neon Postgres. The hosted API runs on Cloudflare Workers and reaches Postgres through Cloudflare Hyperdrive. Remote records are associated with your account, and the application uses account checks and database row-level security to keep users' records separate.</p>
    </>,
  },
  {
    title: "How we use information",
    content: <p>We use information to provide language coaching, save and display lessons, calculate learning progress, authenticate users, synchronize approved data across devices, prevent abuse, secure the service, diagnose failures, and maintain the project. We do not sell personal information or use learning notes for advertising.</p>,
  },
  {
    title: "Service providers",
    content: <>
      <p>Depending on the features you use, information may be processed by <a href="https://neon.com/privacy-policy" target="_blank" rel="noreferrer">Neon</a> for authentication and database hosting, <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare</a> for website and API infrastructure, and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google</a> or <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">GitHub</a> when you choose their sign-in option. Those providers handle information under their own terms and privacy policies.</p>
    </>,
  },
  {
    title: "Cookies and similar storage",
    content: <p>The hosted site uses authentication cookies or similar browser storage needed to sign you in, protect the authentication flow, and maintain your session. Language Coach does not include advertising cookies or third-party marketing trackers.</p>,
  },
  {
    title: "Retention and your choices",
    content: <>
      <p>Local information remains on your device until you delete individual notes or remove the local database. Synced information remains in the remote service until it is deleted or the account is removed, subject to limited backup, security, and legal retention.</p>
      <p>You can delete individual learning notes from the dashboard. You can also turn off local sync, which revokes that device's sync access and removes its local sync credential. For an account or complete remote-data deletion request, contact the maintainers through the project repository and do not include private data in a public issue.</p>
    </>,
  },
  {
    title: "Security",
    content: <p>We use reasonable technical controls designed to protect synced information, including verified authentication, limited database credentials, hashed device tokens, tenant checks, encrypted network connections, and Postgres row-level security. No system is completely secure, so we cannot guarantee absolute security.</p>,
  },
  {
    title: "Children",
    content: <p>Language Coach is not directed to children under 13, and the hosted service is not intended to knowingly collect their personal information. If you believe a child has provided personal information, contact the maintainers so it can be reviewed and removed.</p>,
  },
  {
    title: "Changes and contact",
    content: <p>We may update this policy as the project changes. The date at the top shows the latest revision. Questions or privacy requests can be sent to the maintainers through the <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">Language Coach repository</a>. Do not post passwords, tokens, learning notes, or other private information in a public issue.</p>,
  },
]

const termsSections: LegalSection[] = [
  {
    title: "Acceptance of these terms",
    content: <p>By using the hosted Language Coach website, creating an account, or enabling remote sync, you agree to these terms. If you do not agree, do not use the hosted service or remote sync. Use of the open-source code is also governed by its software license.</p>,
  },
  {
    title: "The service",
    content: <p>Language Coach provides language feedback, stores selected learning notes, and displays learning activity. It is a learning aid, not a professional editing, translation, education, legal, medical, or other advisory service. Automated suggestions may be incomplete or wrong, and you remain responsible for reviewing how you use them.</p>,
  },
  {
    title: "Accounts",
    content: <p>You must provide accurate account information, keep your login credentials secure, and promptly report suspected unauthorized access. You are responsible for activity performed through your account. You may not create an account if you are not legally able to agree to these terms.</p>,
  },
  {
    title: "Acceptable use",
    content: <>
      <p>You may not use the service to:</p>
      <ul>
        <li>break the law or violate another person's rights;</li>
        <li>access another user's account or data without permission;</li>
        <li>probe, bypass, disable, or interfere with security or access controls;</li>
        <li>distribute malware, abusive automation, spam, or harmful content;</li>
        <li>overload, scrape, reverse engineer, or disrupt the hosted service except where applicable law or the open-source license expressly permits it.</li>
      </ul>
    </>,
  },
  {
    title: "Your content",
    content: <p>You keep any rights you have in the expressions and learning material you submit. You give the service permission to process, store, reproduce, and transmit that material only as needed to provide, secure, synchronize, and maintain the features you choose. You are responsible for having the right to submit the material.</p>,
  },
  {
    title: "Open-source software",
    content: <p>The Language Coach source code is available under the MIT License. The license applies to the software itself. It does not promise continued access to any hosted instance, third-party service, account, database, domain, or infrastructure operated by the maintainers or other providers.</p>,
  },
  {
    title: "Third-party services",
    content: <p>The service depends on providers including Neon, Cloudflare, Google, and GitHub. Their services and sign-in options are governed by their own terms and may change, fail, or become unavailable. Language Coach is not responsible for third-party products or accounts.</p>,
  },
  {
    title: "Availability and changes",
    content: <p>The hosted service is provided without a guaranteed service level. We may change, suspend, limit, or discontinue features at any time. You should keep any local or exported information you need. We may update these terms, and continued use after an update means you accept the revised terms.</p>,
  },
  {
    title: "Suspension and termination",
    content: <p>We may suspend or terminate access when reasonably necessary to protect users or infrastructure, comply with law, investigate abuse, or enforce these terms. You may stop using the service at any time. Ending use does not automatically remove information already stored; see the Privacy Policy for deletion choices.</p>,
  },
  {
    title: "Disclaimers",
    content: <p>To the fullest extent permitted by law, the hosted service and software are provided “as is” and “as available,” without warranties of any kind, whether express, implied, or statutory, including warranties of accuracy, availability, fitness for a particular purpose, merchantability, and non-infringement.</p>,
  },
  {
    title: "Limitation of liability",
    content: <p>To the fullest extent permitted by law, the contributors and maintainers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, profits, goodwill, or business arising from use of or inability to use the service. Some jurisdictions do not allow certain exclusions, so parts of this section may not apply to you.</p>,
  },
  {
    title: "Contact",
    content: <p>Questions about these terms can be sent to the maintainers through the <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">Language Coach repository</a>. Do not include passwords, tokens, learning notes, or other private information in a public issue.</p>,
  },
]

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy"
  const title = privacy ? "Privacy Policy" : "Terms of Service"
  const description = privacy
    ? "How Language Coach handles account information, learning notes, local storage, and optional sync."
    : "The rules that apply when you use the hosted Language Coach website, account, and sync features."
  const sections = privacy ? privacySections : termsSections

  useEffect(() => {
    const previousTitle = document.title
    document.title = `${title} · Language Coach`
    return () => { document.title = previousTitle }
  }, [title])

  return (
    <div className="legal-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="legal-header">
        <Link className="legal-brand" to="/" aria-label="Language Coach home">
          <span><LanguagesIcon /></span>
          Language Coach
        </Link>
        <Link className="legal-back-link" to="/"><ArrowLeftIcon /> Back to home</Link>
      </header>

      <main className="legal-content" id="main-content">
        <header className="legal-intro">
          <p className="legal-kicker">Language Coach</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <time dateTime="2026-08-31">Last updated {LAST_UPDATED}</time>
        </header>

        <div className="legal-sections">
          {sections.map((section, index) => (
            <section key={section.title} aria-labelledby={`legal-section-${index}`}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2 id={`legal-section-${index}`}>{section.title}</h2>
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="legal-footer">
        <span>© 2026 Language Coach contributors.</span>
        <nav aria-label="Legal pages">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
        </nav>
      </footer>
    </div>
  )
}
